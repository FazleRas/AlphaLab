from fastapi import APIRouter, Query
from app.services.market_data import get_multiple_prices, get_history

router = APIRouter()

@router.get("/prices")
def prices(tickers: str = Query(...)):
    ticker_list = [t.strip().upper() for t in tickers.split(",")]
    return {"data": get_multiple_prices(ticker_list)}

@router.get("/history/{ticker}")
def history(ticker: str, period: str = "1mo"):
    return {"ticker": ticker.upper(), "prices": get_history(ticker, period)}