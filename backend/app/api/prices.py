from fastapi import APIRouter, Query
from app.services.market_data import get_multiple_prices, get_history, get_quote, get_indicators, get_signals

router = APIRouter()

@router.get("/prices")
def prices(tickers: str = Query(...)):
    ticker_list = [t.strip().upper() for t in tickers.split(",")]
    return {"data": get_multiple_prices(ticker_list)}

@router.get("/history/{ticker}")
def history(ticker: str, period: str = "1mo"):
    return {"ticker": ticker.upper(), "prices": get_history(ticker, period)}

@router.get("/quote/{ticker}")
def quote(ticker: str):
    return {"ticker": ticker.upper(), "quote": get_quote(ticker)}


@router.get("/indicators/{ticker}")
def indicators(ticker: str, period: str = "3mo"):
    return {"ticker": ticker.upper(), "indicators": get_indicators(ticker, period)}

@router.get("/signals/{ticker}")
def signals(ticker: str):
    return get_signals(ticker.upper())