"""SweepStore unit tests + run_sweep_stored worker tests.

Both store implementations run the same test suite: InMemorySweepStore
directly, RedisSweepStore against a minimal in-process fake with real
get/set(ex=...) semantics — the JSON round-trip and TTL plumbing are
exercised, no server needed.
"""

import json
import types

import numpy as np
import pandas as pd
import pytest

from app.services import market_data
from app.services.market_data import run_sweep_stored
from app.services.sweep_store import InMemorySweepStore, RedisSweepStore


class FakeRedis:
    def __init__(self):
        self.data = {}
        self.ttls = {}

    def get(self, key):
        return self.data.get(key)

    def set(self, key, value, ex=None):
        self.data[key] = value
        self.ttls[key] = ex


@pytest.fixture(params=["memory", "redis"])
def store(request):
    if request.param == "memory":
        return InMemorySweepStore()
    return RedisSweepStore(FakeRedis(), ttl_seconds=123)


def _cell(buy, sell, total_return_pct):
    return {"buy_rsi": buy, "sell_rsi": sell, "total_return_pct": total_return_pct}


# ---------------------------------------------------------------------------
# Store contract
# ---------------------------------------------------------------------------

def test_create_and_get_roundtrip(store):
    grid = {"ticker": "AAPL", "buy_values": [20, 25], "sell_values": [70]}
    sweep_id = store.create(grid, total=2)
    state = store.get(sweep_id)
    assert state["sweep_id"] == sweep_id
    assert state["status"] == "pending"
    assert state["total"] == 2
    assert state["completed"] == 0
    assert state["params_grid"] == grid
    assert state["best"] is None
    assert state["results"] == []
    assert state["error"] is None


def test_get_unknown_id_returns_none(store):
    assert store.get("nope") is None
    # and the mutators must not blow up on a bogus/expired id
    store.record_result("nope", _cell(20, 70, 1.0))
    store.set_status("nope", "done")


def test_record_result_appends_and_tracks_best(store):
    sweep_id = store.create({}, total=4)

    # A no-trades cell (total_return_pct None) must never become best...
    store.record_result(sweep_id, _cell(20, 70, None))
    state = store.get(sweep_id)
    assert state["completed"] == 1
    assert state["best"] is None

    # ...a traded cell does, a worse one doesn't displace it,
    store.record_result(sweep_id, _cell(25, 70, 3.5))
    store.record_result(sweep_id, _cell(30, 70, 1.2))
    state = store.get(sweep_id)
    assert state["best"]["buy_rsi"] == 25

    # ...and a better one does.
    store.record_result(sweep_id, _cell(35, 70, 9.9))
    state = store.get(sweep_id)
    assert state["best"]["buy_rsi"] == 35
    assert state["completed"] == 4
    assert [c["buy_rsi"] for c in state["results"]] == [20, 25, 30, 35]


def test_status_transitions_and_terminal_guard(store):
    sweep_id = store.create({}, total=1)
    store.set_status(sweep_id, "running")
    assert store.get(sweep_id)["status"] == "running"

    store.set_status(sweep_id, "failed", error="boom")
    state = store.get(sweep_id)
    assert state["status"] == "failed"
    assert state["error"] == "boom"

    # terminal is final: neither a cancel nor a late 'done' may overwrite it
    store.set_status(sweep_id, "cancelled")
    store.set_status(sweep_id, "done")
    assert store.get(sweep_id)["status"] == "failed"


# ---------------------------------------------------------------------------
# Redis-specific plumbing
# ---------------------------------------------------------------------------

def test_redis_store_json_blob_with_ttl_refresh():
    fake = FakeRedis()
    store = RedisSweepStore(fake, ttl_seconds=123, key_prefix="t:sweep:")
    sweep_id = store.create({"ticker": "AAPL"}, total=1)

    key = f"t:sweep:{sweep_id}"
    assert set(fake.data) == {key}
    assert json.loads(fake.data[key])["status"] == "pending"
    assert fake.ttls[key] == 123

    # every write refreshes the TTL, so an active sweep can't expire mid-run
    fake.ttls[key] = None
    store.record_result(sweep_id, _cell(20, 70, 1.0))
    assert fake.ttls[key] == 123

    # expiry -> get() reports None, exactly like an unknown id
    del fake.data[key]
    assert store.get(sweep_id) is None


# ---------------------------------------------------------------------------
# Worker: run_sweep_stored
# ---------------------------------------------------------------------------

N_BARS = 300
BUY_VALUES = [40.0, 45.0, 50.0]
SELL_VALUES = [55.0, 60.0]


@pytest.fixture
def patched_yf(monkeypatch):
    """Point market_data.yf at a deterministic synthetic series (no network)."""
    rng = np.random.default_rng(42)
    close = 100 + np.cumsum(rng.normal(0, 1, N_BARS))
    df = pd.DataFrame(
        {"Close": close},
        index=pd.date_range("2024-01-02", periods=N_BARS, freq="B"),
    )

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period=None):
            return df.copy()

    monkeypatch.setattr(market_data, "yf", types.SimpleNamespace(Ticker=FakeTicker))


def test_worker_matches_sync_sweep(patched_yf):
    """The stored sweep must produce the exact grid and best that the
    synchronous run_sweep produces on the same data."""
    sync = market_data.run_sweep("TEST", "max", "rsi", BUY_VALUES, SELL_VALUES)

    store = InMemorySweepStore()
    sweep_id = store.create({}, total=len(BUY_VALUES) * len(SELL_VALUES))
    run_sweep_stored(store, sweep_id, "TEST", "max", "rsi", BUY_VALUES, SELL_VALUES)

    state = store.get(sweep_id)
    assert state["status"] == "done"
    assert state["completed"] == state["total"] == len(sync["grid"])
    assert state["results"] == sync["grid"]
    assert state["best"] == sync["best"]
    assert state["error"] is None


def test_worker_stops_on_cancel(patched_yf):
    class CancelAfter(InMemorySweepStore):
        def __init__(self, after):
            super().__init__()
            self._after = after

        def record_result(self, sweep_id, result):
            super().record_result(sweep_id, result)
            if self.get(sweep_id)["completed"] == self._after:
                self.set_status(sweep_id, "cancelled")

    store = CancelAfter(after=2)
    sweep_id = store.create({}, total=len(BUY_VALUES) * len(SELL_VALUES))
    run_sweep_stored(store, sweep_id, "TEST", "max", "rsi", BUY_VALUES, SELL_VALUES)

    state = store.get(sweep_id)
    assert state["status"] == "cancelled"  # worker's final 'done' was refused
    assert state["completed"] == 2  # stopped early, didn't burn the grid


def test_worker_records_failure(patched_yf, monkeypatch):
    def explode(ticker, period):
        raise RuntimeError("yfinance fell over")

    monkeypatch.setattr(market_data, "get_indicators", explode)
    store = InMemorySweepStore()
    sweep_id = store.create({}, total=6)
    run_sweep_stored(store, sweep_id, "TEST", "max", "rsi", BUY_VALUES, SELL_VALUES)

    state = store.get(sweep_id)
    assert state["status"] == "failed"
    assert "yfinance fell over" in state["error"]
