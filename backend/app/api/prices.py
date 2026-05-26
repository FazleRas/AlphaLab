from fastapi import APIRouter, Query
from typing import Optional
from app.services.market_data import get_multiple_prices, get_history, get_quote, get_indicators, get_signals, scan_tickers, run_backtest

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

@router.get("/scan")
def scan(
    tickers: str = Query(...),
    bullish_trend: Optional[bool] = None,
    bearish_trend: Optional[bool] = None,
    rsi_oversold: Optional[bool] = None,
    rsi_overbought: Optional[bool] = None,
    macd_bullish_crossover: Optional[bool] = None,
    macd_bearish_crossover: Optional[bool] = None,
):
    ticker_list = [t.strip().upper() for t in tickers.split(",")]
    filters = {
        "bullish_trend": bullish_trend,
        "bearish_trend": bearish_trend,
        "rsi_oversold": rsi_oversold,
        "rsi_overbought": rsi_overbought,
        "macd_bullish_crossover": macd_bullish_crossover,
        "macd_bearish_crossover": macd_bearish_crossover,
    }
    
    active_filters = {k: v for k, v in filters.items() if v is not None}
    return {"results": scan_tickers(ticker_list, active_filters)}

@router.get("/backtest/{ticker}")
def backtest(
    ticker: str,
    period: str = "1y",
    buy_rsi: float = 30,
    sell_rsi: float = 70,
):
    return run_backtest(ticker.upper(), period, buy_rsi, sell_rsi)