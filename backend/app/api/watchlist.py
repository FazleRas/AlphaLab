from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.db import get_pool

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


class TickerIn(BaseModel):
    ticker: str


def _require_pool():
    pool = get_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    return pool


@router.get("")
async def list_watchlist(user_id: str = Depends(get_current_user_id)):
    pool = _require_pool()
    rows = await pool.fetch(
        "SELECT ticker FROM watchlist WHERE user_id = $1 ORDER BY created_at",
        user_id,
    )
    return {"tickers": [r["ticker"] for r in rows]}


@router.post("")
async def add_ticker(body: TickerIn, user_id: str = Depends(get_current_user_id)):
    ticker = body.ticker.strip().upper()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker is required")
    pool = _require_pool()
    await pool.execute(
        "INSERT INTO watchlist (user_id, ticker) VALUES ($1, $2) "
        "ON CONFLICT (user_id, ticker) DO NOTHING",
        user_id,
        ticker,
    )
    return {"ok": True, "ticker": ticker}


@router.delete("/{ticker}")
async def remove_ticker(ticker: str, user_id: str = Depends(get_current_user_id)):
    pool = _require_pool()
    await pool.execute(
        "DELETE FROM watchlist WHERE user_id = $1 AND ticker = $2",
        user_id,
        ticker.strip().upper(),
    )
    return {"ok": True}
