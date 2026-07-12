"""Optional Redis cache for the market-data layer.

yfinance calls are slow (network round-trip per ticker) and rate-limited, so
the fetchers in market_data.py cache their JSON-serializable results here.
Set REDIS_URL to enable (e.g. a Render Key Value instance or Upstash); when
it's unset the app runs exactly as before and every call falls through to
yfinance — same optional pattern as DATABASE_URL in db.py.

The cache FAILS OPEN by design: any Redis error (down, slow, full) is
swallowed and the caller just fetches fresh data. Timeouts are kept tight so
a dead Redis costs ~1s once, not a hang — and after a connection error the
client backs off briefly instead of re-timing-out on every request.

Keys are namespaced `al:v1:` so a future format change can bump the version
instead of flushing. Hit/miss counters live in Redis (INCR) and are exposed
at GET /cache-stats.
"""
from __future__ import annotations

import json
import os
import time

import redis

_client = None
_client_checked = False
_down_until = 0.0  # after a connection error, skip Redis until this time

_RETRY_SECONDS = 30
_PREFIX = "al:v1:"


def _get_client() -> redis.Redis | None:
    global _client, _client_checked
    if not _client_checked:
        _client_checked = True
        url = os.environ.get("REDIS_URL")
        if url:
            _client = redis.Redis.from_url(
                url,
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=1,
            )
    return _client


def _available() -> redis.Redis | None:
    if time.monotonic() < _down_until:
        return None
    return _get_client()


def _mark_down():
    global _down_until
    _down_until = time.monotonic() + _RETRY_SECONDS


def cache_json(key: str, ttl: int, fetch, should_cache=bool):
    """Return the cached value for `key`, or call `fetch()` and cache it.

    A result is only stored when `should_cache(result)` is true — by default
    just truthiness, so a transient empty/None response from yfinance never
    gets pinned for the whole TTL. Fetch errors propagate to the caller
    unchanged; Redis errors are swallowed (fail open).
    """
    r = _available()
    full_key = _PREFIX + key

    if r is not None:
        try:
            hit = r.get(full_key)
            if hit is not None:
                r.incr(_PREFIX + "stats:hits")
                return json.loads(hit)
            r.incr(_PREFIX + "stats:misses")
        except (redis.RedisError, OSError):
            _mark_down()
            r = None
        except ValueError:
            # Corrupted/unparseable entry: drop it and refetch.
            try:
                r.delete(full_key)
            except (redis.RedisError, OSError):
                pass

    result = fetch()

    if r is not None and should_cache(result):
        try:
            r.set(full_key, json.dumps(result), ex=ttl)
        except (redis.RedisError, OSError, TypeError):
            pass

    return result


def stats() -> dict:
    """Cache hit/miss counters for GET /cache-stats."""
    if not os.environ.get("REDIS_URL"):
        return {"enabled": False}
    r = _available()
    if r is None:
        return {"enabled": True, "connected": False}
    try:
        hits = int(r.get(_PREFIX + "stats:hits") or 0)
        misses = int(r.get(_PREFIX + "stats:misses") or 0)
    except (redis.RedisError, OSError):
        _mark_down()
        return {"enabled": True, "connected": False}
    total = hits + misses
    return {
        "enabled": True,
        "connected": True,
        "hits": hits,
        "misses": misses,
        "hit_rate_pct": round(hits / total * 100, 1) if total else None,
    }
