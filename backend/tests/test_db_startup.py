"""The app must boot when DATABASE_URL is set but the database is unreachable.

Regression for the Render deploy that failed with
`asyncpg.exceptions.InternalServerError: (ENOTFOUND) tenant/user ... not found`
(a paused Supabase project): the lifespan raised, uvicorn exited, and Render
kept serving the previous build. Booting without the pool keeps every
non-DB route live and lets the DB-backed ones 503 honestly.
"""

import asyncio

import asyncpg
import pytest
from fastapi.testclient import TestClient

import main
from app import db


@pytest.fixture(autouse=True)
def reset_pool():
    db._pool = None
    yield
    db._pool = None


@pytest.fixture
def unreachable_db(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://postgres.gone:pw@pooler.example:6543/postgres")

    async def explode(*args, **kwargs):
        raise asyncpg.exceptions.InternalServerError(
            "(ENOTFOUND) tenant/user postgres.gone not found"
        )

    monkeypatch.setattr(asyncpg, "create_pool", explode)


@pytest.mark.parametrize(
    "exc",
    [
        asyncpg.exceptions.InternalServerError("(ENOTFOUND) tenant/user postgres.gone not found"),
        asyncpg.exceptions.InvalidPasswordError("password authentication failed"),
        OSError("Connection refused"),
        asyncio.TimeoutError(),
    ],
)
def test_init_pool_fails_open(monkeypatch, exc):
    monkeypatch.setenv("DATABASE_URL", "postgresql://x:y@pooler.example:6543/postgres")

    async def explode(*args, **kwargs):
        raise exc

    monkeypatch.setattr(asyncpg, "create_pool", explode)
    asyncio.run(db.init_pool())  # must not raise
    assert db.get_pool() is None


def test_init_pool_bounds_the_connect_wait(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://x:y@pooler.example:6543/postgres")
    seen = {}

    async def record(*args, **kwargs):
        seen.update(kwargs)
        return object()

    monkeypatch.setattr(asyncpg, "create_pool", record)
    asyncio.run(db.init_pool())
    assert seen["timeout"] == db.CONNECT_TIMEOUT_SECONDS


def test_app_boots_and_serves_without_db(unreachable_db):
    # `with` runs the lifespan, which is where the old code exited.
    with TestClient(main.app) as client:
        assert client.get("/").status_code == 200
        assert db.get_pool() is None
        # DB-backed routes report the outage instead of crashing the process.
        res = client.get("/watchlist", headers={"Authorization": "Bearer not-a-real-token"})
        assert res.status_code in (401, 503)
