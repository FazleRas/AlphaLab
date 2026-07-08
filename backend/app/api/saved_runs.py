import uuid
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.db import get_pool

router = APIRouter(prefix="/saved-runs", tags=["saved_runs"])


class SavedRunIn(BaseModel):
    ticker: str
    strategy: str
    period: str
    params: Dict[str, Any] = {}
    metrics: Dict[str, Any] = {}


def _require_pool():
    pool = get_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    return pool


@router.get("")
async def list_saved_runs(user_id: str = Depends(get_current_user_id)):
    pool = _require_pool()
    rows = await pool.fetch(
        "SELECT id, ticker, strategy, period, params, metrics, created_at "
        "FROM saved_runs WHERE user_id = $1 ORDER BY created_at DESC",
        user_id,
    )
    return {"runs": [dict(r) for r in rows]}


@router.post("")
async def create_saved_run(body: SavedRunIn, user_id: str = Depends(get_current_user_id)):
    ticker = body.ticker.strip().upper()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker is required")
    pool = _require_pool()
    row = await pool.fetchrow(
        "INSERT INTO saved_runs (user_id, ticker, strategy, period, params, metrics) "
        "VALUES ($1, $2, $3, $4, $5, $6) "
        "RETURNING id, ticker, strategy, period, params, metrics, created_at",
        user_id,
        ticker,
        body.strategy,
        body.period,
        body.params,
        body.metrics,
    )
    return dict(row)


@router.delete("/{run_id}")
async def delete_saved_run(run_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        run_uuid = uuid.UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Run not found")
    pool = _require_pool()
    result = await pool.execute(
        "DELETE FROM saved_runs WHERE id = $1 AND user_id = $2",
        run_uuid,
        user_id,
    )
    # asyncpg returns e.g. "DELETE 1" / "DELETE 0"
    if result.endswith("0"):
        raise HTTPException(status_code=404, detail="Run not found")
    return {"ok": True}
