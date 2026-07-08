"""asyncpg connection pool for the Supabase Postgres database.

Connect via the TRANSACTION POOLER string (port 6543, *.pooler.supabase.com),
set as DATABASE_URL. statement_cache_size=0 is required against the pooler —
without it asyncpg reuses prepared statements across pooled connections and
raises "prepared statement ... already exists".

The pool is optional: if DATABASE_URL is unset the app still boots and the
market-data endpoints keep working; only the DB-backed routes return 503.
"""
import json
import os

import asyncpg

_pool = None


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
    _pool = await asyncpg.create_pool(
        dsn,
        statement_cache_size=0,
        min_size=1,
        max_size=5,
        init=_init_connection,
    )


async def close_pool():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool():
    return _pool
