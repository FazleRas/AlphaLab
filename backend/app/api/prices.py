from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.services.market_data import get_multiple_prices, get_history, get_quote, get_indicators, get_signals, scan_tickers, run_backtest, run_sweep, run_validation, run_compare

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
    q = get_quote(ticker)
    # yfinance answers unknown/delisted tickers with an empty shell (every
    # price field None) rather than an error; surface it as a 404 the UI can
    # show instead of rendering a quote full of nulls.
    if q.get("price") is None:
        raise HTTPException(
            status_code=404,
            detail=f"No market data for '{ticker.upper()}'. Check the symbol - Yahoo Finance may not support it or it may be delisted.",
        )
    return {"ticker": ticker.upper(), "quote": q}


@router.get("/indicators/{ticker}")
def indicators(ticker: str, period: str = "3mo"):
    return {"ticker": ticker.upper(), "indicators": get_indicators(ticker, period)}

@router.get("/signals/{ticker}")
def signals(ticker: str):
    result = get_signals(ticker.upper())
    # get_signals reports "no usable price history" as an error dict (the
    # scanner consumes that shape); for the single-ticker endpoint a 404 is
    # the honest answer.
    if result.get("error"):
        raise HTTPException(
            status_code=404,
            detail=f"Not enough price history for '{ticker.upper()}' to generate signals.",
        )
    return result

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
    strategy: str = "rsi",
    buy_rsi: float = 30,
    sell_rsi: float = 70,
):
    return run_backtest(ticker.upper(), period, strategy, buy_rsi, sell_rsi)

MAX_SWEEP_CELLS = 121

def _frange(lo, hi, step):
    if step <= 0:
        return []
    values, v = [], lo
    while v <= hi + 1e-9:
        values.append(round(v, 2))
        v += step
    return values

@router.get("/sweep/{ticker}")
def sweep(
    ticker: str,
    period: str = "2y",
    strategy: str = "rsi",
    buy_min: float = 20,
    buy_max: float = 40,
    buy_step: float = 5,
    sell_min: float = 60,
    sell_max: float = 80,
    sell_step: float = 5,
):
    buy_values = _frange(buy_min, buy_max, buy_step)
    sell_values = _frange(sell_min, sell_max, sell_step)
    if not buy_values or not sell_values:
        return {"error": "Invalid sweep range"}
    if len(buy_values) * len(sell_values) > MAX_SWEEP_CELLS:
        return {"error": f"Sweep grid too large (max {MAX_SWEEP_CELLS} cells)"}
    return run_sweep(ticker.upper(), period, strategy, buy_values, sell_values)

@router.get("/validate/{ticker}")
def validate(
    ticker: str,
    period: str = "2y",
    strategy: str = "rsi",
    buy_min: float = 20,
    buy_max: float = 40,
    buy_step: float = 5,
    sell_min: float = 60,
    sell_max: float = 80,
    sell_step: float = 5,
    split: float = 0.7,
    top_n: int = 3,
):
    buy_values = _frange(buy_min, buy_max, buy_step)
    sell_values = _frange(sell_min, sell_max, sell_step)
    if not buy_values or not sell_values:
        return {"error": "Invalid sweep range"}
    if len(buy_values) * len(sell_values) > MAX_SWEEP_CELLS:
        return {"error": f"Sweep grid too large (max {MAX_SWEEP_CELLS} cells)"}
    split = min(max(split, 0.5), 0.9)
    top_n = min(max(top_n, 1), 5)
    return run_validation(ticker.upper(), period, strategy, buy_values, sell_values, split, top_n)

@router.get("/compare/{ticker}")
def compare(
    ticker: str,
    period: str = "2y",
    buy_rsi: float = 30,
    sell_rsi: float = 70,
):
    return run_compare(ticker.upper(), period, buy_rsi, sell_rsi)