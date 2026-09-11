"""asyncpg connection pool for the Supabase Postgres database.

Connect via the TRANSACTION POOLER string (port 6543, *.pooler.supabase.com),
set as DATABASE_URL. statement_cache_size=0 is required against the pooler —
without it asyncpg reuses prepared statements across pooled connections and
raises "prepared statement ... already exists".

The pool is optional: if DATABASE_URL is unset the app still boots and the
market-data endpoints keep working; only the DB-backed routes return 503.

The same holds when DATABASE_URL is set but the database cannot be reached at
startup. A paused Supabase project (free projects pause after a week idle)
makes the pooler answer "tenant/user ... not found"; if that raised out of
the lifespan, uvicorn would exit and Render would keep the previous deploy
live — so a paused database would silently pin the whole API to old code.
Instead the failure is logged, the pool stays None, and the DB-backed routes
503 until the next restart finds the database again.
"""
import asyncio
import json
import logging
import os

import asyncpg

log = logging.getLogger("alphalab.db")

_pool = None

# Bound the startup wait: a database that hangs rather than refusing would
# otherwise stall the boot past Render's port-binding deadline.
CONNECT_TIMEOUT_SECONDS = 10


async def _init_connection(conn):
    # Transparently marshal jsonb <-> Python dict so params/metrics round-trip.
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )


async def init_pool():
    global _pool
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        return
    try:
        _pool = await asyncpg.create_pool(
            dsn,
            statement_cache_size=0,
            min_size=1,
            max_size=5,
            init=_init_connection,
            timeout=CONNECT_TIMEOUT_SECONDS,
        )
    except (asyncpg.PostgresError, OSError, asyncio.TimeoutError) as exc:
        # min_size=1 means create_pool connects eagerly, so an unreachable
        # database fails here rather than on the first query.
        _pool = None
        log.error(
            "Database unreachable at startup (%s: %s); booting without it. "
            "DB-backed routes will return 503.",
            type(exc).__name__, exc,
        )


async def close_pool():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool():
    return _pool
