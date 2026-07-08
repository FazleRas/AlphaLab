"""One-off connectivity check for the Supabase Postgres pipe.

Run this once to prove FastAPI can reach the database, then it can be deleted.

    cd backend
    export DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres"
    python test_db.py

Use the TRANSACTION POOLER string (port 6543, *.pooler.supabase.com) — the
direct connection (db.<ref>.supabase.co:5432) is IPv6-only and fails on Render.

statement_cache_size=0 is REQUIRED against the transaction pooler; without it
asyncpg reuses prepared statements across pooled connections and you get a
cryptic "prepared statement ... already exists" error.
"""
import asyncio
import os
import sys

import asyncpg


async def main():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL is not set. Export the transaction pooler string first.")

    conn = await asyncpg.connect(dsn, statement_cache_size=0)
    try:
        count = await conn.fetchval("SELECT count(*) FROM saved_runs")
        print(f"OK — connected. saved_runs has {count} row(s).")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
