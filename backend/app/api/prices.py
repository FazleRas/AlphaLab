from fastapi import APIRouter, Query
from typing import Optional
from app.services.market_data import get_multiple_prices, get_history, get_quote, get_indicators, get_signals, scan_tickers, run_backtest, run_sweep

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