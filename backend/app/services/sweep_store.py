"""Sweep state persistence.

The synchronous GET /sweep/{ticker} endpoint runs the whole grid in-request:
fine for a 121-cell grid on one worker, but the response is all-or-nothing —
no progress readout, nothing survives a refresh, and with 2+ workers there is
no state a second worker could even ask about. These stores back the async
sweep endpoints (POST /sweeps/{ticker} + GET /sweeps/{sweep_id}) so the UI
can poll progress and a sweep outlives the request that started it.

Two implementations of one interface:
  - InMemorySweepStore: no dependencies; used in tests and as the fallback
    when REDIS_URL is unset. State dies with the process and is invisible to
    other workers — the module-level-dict caveats, made explicit.
  - RedisSweepStore: state lives in Redis as one JSON blob per sweep_id with
    a TTL, so sweeps survive restarts, are visible across workers, and dead
    sweeps garbage-collect themselves.

One blob per sweep (not per-combo keys): a sweep is written by exactly one
background task, so whole-blob read/modify/write is race-free and costs one
round trip per update. If combos ever run in parallel across processes,
switch record_result to a Lua script or a Redis hash + RPUSH list.

Unlike the cache layer, this does NOT fail open: sweep state is correctness,
not a shortcut, so Redis errors propagate to the caller instead of being
swallowed (a poll that can't reach Redis should error, not report 404/fresh).
"""
from __future__ import annotations

import json
import time
import uuid
from abc import ABC, abstractmethod
from typing import Optional

import redis

from app import cache

TERMINAL_STATUSES = {"done", "failed", "cancelled"}

# Active sweeps refresh their TTL on every write, so they never expire
# mid-run; finished ones linger long enough to be fetched/exported.
SWEEP_TTL_SECONDS = 60 * 60 * 6


def _now() -> float:
    return time.time()


def _new_state(sweep_id: str, params_grid: dict, total: int) -> dict:
    return {
        "sweep_id": sweep_id,
        "status": "pending",
        "total": total,
        "completed": 0,
        "started_at": _now(),
        "updated_at": _now(),
        "params_grid": params_grid,
        "best": None,
        "results": [],
        "error": None,
    }


def _rank(cell: dict) -> float:
    # Same headline metric as run_sweep's best pick. total_return_pct is None
    # when the combo never traded; those must never beat a traded cell.
    value = cell.get("total_return_pct")
    return -float("inf") if value is None else value


def _apply_result(state: dict, result: dict) -> None:
    state["results"].append(result)
    state["completed"] += 1
    state["updated_at"] = _now()
    # Strict > against -inf keeps untraded cells (rank -inf) from ever
    # becoming best, matching run_sweep's traded-only max.
    floor = -float("inf") if state["best"] is None else _rank(state["best"])
    if _rank(result) > floor:
        state["best"] = result


def _apply_status(state: dict, status: str, error: Optional[str]) -> bool:
    # Terminal states are final: a late cancel can't overwrite 'done', and
    # the worker's final 'done' can't overwrite 'cancelled'.
    if state["status"] in TERMINAL_STATUSES:
        return False
    state["status"] = status
    state["error"] = error
    state["updated_at"] = _now()
    return True


class SweepStore(ABC):
    """Persistence interface for parameter sweep state."""

    @abstractmethod
    def create(self, params_grid: dict, total: int) -> str:
        """Create a new sweep record, return its sweep_id."""

    @abstractmethod
    def get(self, sweep_id: str) -> Optional[dict]:
        """Fetch full sweep state, or None if unknown/expired."""

    @abstractmethod
    def record_result(self, sweep_id: str, result: dict) -> None:
        """Append one finished combo's cell, bump completed, update best."""

    @abstractmethod
    def set_status(self, sweep_id: str, status: str,
                   error: Optional[str] = None) -> None:
        """Transition sweep status; sets the error message on 'failed'.
        No-op once the sweep is in a terminal state."""


class InMemorySweepStore(SweepStore):
    """Process-local store: tests, and the no-REDIS_URL fallback."""

    def __init__(self) -> None:
        self._sweeps: dict[str, dict] = {}

    def create(self, params_grid: dict, total: int) -> str:
        sweep_id = uuid.uuid4().hex
        self._sweeps[sweep_id] = _new_state(sweep_id, params_grid, total)
        return sweep_id

    def get(self, sweep_id: str) -> Optional[dict]:
        return self._sweeps.get(sweep_id)

    def record_result(self, sweep_id: str, result: dict) -> None:
        state = self._sweeps.get(sweep_id)
        if state is not None:
            _apply_result(state, result)

    def set_status(self, sweep_id: str, status: str,
                   error: Optional[str] = None) -> None:
        state = self._sweeps.get(sweep_id)
        if state is not None:
            _apply_status(state, status, error)


class RedisSweepStore(SweepStore):
    """Sweep state as one JSON blob per sweep_id in Redis."""

    def __init__(self, client: "redis.Redis",
                 ttl_seconds: int = SWEEP_TTL_SECONDS,
                 # Share the cache layer's `al:v1:` namespace so a future
                 # format change bumps one version string, not two.
                 key_prefix: str = cache._PREFIX + "sweep:") -> None:
        self._r = client
        self._ttl = ttl_seconds
        self._prefix = key_prefix

    def _key(self, sweep_id: str) -> str:
        return f"{self._prefix}{sweep_id}"

    def _read(self, sweep_id: str) -> Optional[dict]:
        raw = self._r.get(self._key(sweep_id))
        return json.loads(raw) if raw else None

    def _write(self, state: dict) -> None:
        self._r.set(self._key(state["sweep_id"]), json.dumps(state), ex=self._ttl)

    def create(self, params_grid: dict, total: int) -> str:
        sweep_id = uuid.uuid4().hex
        self._write(_new_state(sweep_id, params_grid, total))
        return sweep_id

    def get(self, sweep_id: str) -> Optional[dict]:
        return self._read(sweep_id)

    def record_result(self, sweep_id: str, result: dict) -> None:
        state = self._read(sweep_id)
        if state is None:
            return  # expired or bogus id; the worker treats this as cancelled
        _apply_result(state, result)
        self._write(state)

    def set_status(self, sweep_id: str, status: str,
                   error: Optional[str] = None) -> None:
        state = self._read(sweep_id)
        if state is not None and _apply_status(state, status, error):
            self._write(state)


_store: Optional[SweepStore] = None


def get_store() -> SweepStore:
    """Singleton store for the route layer: Redis when REDIS_URL is set
    (reusing the cache layer's client and its tight timeouts), in-memory
    otherwise so the feature still works in a bare dev environment."""
    global _store
    if _store is None:
        client = cache._get_client()
        _store = RedisSweepStore(client) if client is not None else InMemorySweepStore()
    return _store
