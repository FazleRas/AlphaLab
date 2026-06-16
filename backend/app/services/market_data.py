from socket import close

import yfinance as yf

def get_price(ticker: str):
    stock = yf.Ticker(ticker)
    data = stock.history(period="1d")
    return float(data["Close"].iloc[-1])

def get_multiple_prices(tickers: list[str]):
    results = {}
    for t in tickers:
        try:
            results[t] = get_price(t)
        except Exception:
            results[t] = None
    return results

def get_history(ticker: str, period: str = "1mo"):
    stock = yf.Ticker(ticker)
    data = stock.history(period=period)
    return [
        {
            "date": str(index.date()),
            "open": round(float(row["Open"]), 2),
            "high": round(float(row["High"]), 2),
            "low": round(float(row["Low"]), 2),
            "close": round(float(row["Close"]), 2),
            "volume": int(row["Volume"])
        }
        for index, row in data.iterrows()
    ]

def get_quote(ticker: str):
    stock = yf.Ticker(ticker)
    info = stock.info

    price = (
        info.get("currentPrice") or
        info.get("regularMarketPrice") or
        info.get("previousClose")
    )
    
    open_price = info.get("regularMarketOpen") or info.get("open")
    change = round(price - open_price, 2) if price and open_price else None
    change_pct = round((change / open_price) * 100, 2) if change and open_price else None

    return {
        "ticker": ticker.upper(),
        "price": price,
        "open": open_price,
        "change": change,
        "change_pct": change_pct,
        "day_high": info.get("dayHigh") or info.get("regularMarketDayHigh"),
        "day_low": info.get("dayLow") or info.get("regularMarketDayLow"),
        "volume": info.get("volume") or info.get("regularMarketVolume"),
        "market_cap": info.get("marketCap"),
        "pe_ratio": info.get("trailingPE"),
    }

def get_indicators(ticker: str, period: str = "3mo"):
    stock = yf.Ticker(ticker)
    data = stock.history(period=period)
    
    close = data["Close"]
    
    # SMA
    data["sma_20"] = close.rolling(window=20).mean().round(2)
    data["sma_50"] = close.rolling(window=50).mean().round(2)
    
    # RSI
    delta = close.diff()
    gain = delta.where(delta > 0, 0).rolling(window=14).mean()
    loss = -delta.where(delta < 0, 0).rolling(window=14).mean()
    rs = gain / loss
    data["rsi"] = (100 - (100 / (1 + rs))).round(2)

    # MACD
    ema_12 = close.ewm(span=12, adjust=False).mean()
    ema_26 = close.ewm(span=26, adjust=False).mean()
    data["macd"] = (ema_12 - ema_26).round(4)
    data["macd_signal"] = data["macd"].ewm(span=9, adjust=False).mean().round(4)
    data["macd_histogram"] = (data["macd"] - data["macd_signal"]).round(4)
    
    return [
        {
            "date": str(index.date()),
            "close": round(float(row["Close"]), 2),
            "sma_20": None if str(row["sma_20"]) == "nan" else row["sma_20"],
            "sma_50": None if str(row["sma_50"]) == "nan" else row["sma_50"],
            "rsi": None if str(row["rsi"]) == "nan" else row["rsi"],
            "macd": None if str(row["macd"]) == "nan" else row["macd"],
            "macd_signal": None if str(row["macd_signal"]) == "nan" else row["macd_signal"],
            "macd_histogram": None if str(row["macd_histogram"]) == "nan" else row["macd_histogram"],
        }
        # Skip rows with no close. yfinance returns the current incomplete
        # trading day with a NaN close, which is not JSON-serializable and
        # breaks /indicators (the chart), /signals, and backtests.
        for index, row in data.iterrows()
        if row["Close"] == row["Close"]
    ]

def get_signals(ticker: str):
    data = get_indicators(ticker, period="6mo")
    
    # Grab the most recent day that has full indicator data. yfinance includes
    # the current (incomplete) trading day with a NaN close but a valid RSI;
    # selecting it would make the signal comparisons below raise on NaN/None.
    def is_complete(d):
        return (
            d["rsi"] is not None
            and d["sma_20"] is not None
            and d["sma_50"] is not None
            and d["macd"] is not None
            and d["macd_signal"] is not None
            and d["close"] == d["close"]
        )

    latest = next((d for d in reversed(data) if is_complete(d)), None)

    if not latest:
        return {"error": "not enough data to generate signals"}
    
    close = latest["close"]
    sma_20 = latest["sma_20"]
    sma_50 = latest["sma_50"]
    rsi = latest["rsi"]
    
    return {
        "ticker": ticker.upper(),
        "date": latest["date"],
        "close": close,
        "signals": {
            "rsi_oversold": bool(rsi < 30),
            "rsi_overbought": bool(rsi > 70),
            "price_above_sma20": bool(close > sma_20),
            "price_above_sma50": bool(close > sma_50),
            "sma20_above_sma50": bool(sma_20 > sma_50),
            "bullish_trend": bool(close > sma_20 and sma_20 > sma_50),
            "bearish_trend": bool(close < sma_20 and sma_20 < sma_50),
            "macd_bullish_crossover": bool(latest["macd"] > latest["macd_signal"]),
            "macd_bearish_crossover": bool(latest["macd"] < latest["macd_signal"]),
        },
        "rsi": rsi,
        "sma_20": sma_20,
        "sma_50": sma_50,
        "macd": latest["macd"],
        "macd_signal": latest["macd_signal"],
        "macd_histogram": latest["macd_histogram"],
    }

def scan_tickers(tickers: list[str], filters: dict):
    print("FILTERS RECEIVED:", filters)
    results = []
    for ticker in tickers:
        try:
            signals = get_signals(ticker)
            if "error" in signals:
                continue
            
            active_filters = {k: v for k, v in filters.items() if v == True}

            if not active_filters:
                match = True
            else:
                match = all(signals["signals"].get(f) == True for f in active_filters)

            print(f"{ticker} bearish_trend:", signals["signals"].get("bearish_trend"))
            print(f"{ticker} match:", match)
            
            if match:
                results.append(signals)
        except Exception:
            continue
    return results

INITIAL_CAPITAL = 10000.0

def _to_iso(date_str: str) -> str:
    return f"{date_str}T00:00:00Z"

def _benchmark_curve(equity_curve, close_by_date):
    """Mark INITIAL_CAPITAL invested at the first equity-curve date to market
    on each subsequent point, so a benchmark shares the strategy's x-axis.
    Carries the last known close forward across any missing dates."""
    dates = [point["timestamp"][:10] for point in equity_curve]
    base = close_by_date.get(dates[0]) if dates else None
    if not base:
        return []
    curve = []
    last = base
    for point, date in zip(equity_curve, dates):
        last = close_by_date.get(date, last)
        curve.append({
            "timestamp": point["timestamp"],
            "equity": round(INITIAL_CAPITAL * last / base, 2),
        })
    return curve

def run_backtest(ticker: str, period: str, strategy: str, buy_rsi: float = 30, sell_rsi: float = 70):
    data = get_indicators(ticker, period=period)
    # Drop rows missing indicators or a close price. yfinance includes the
    # current (incomplete) trading day with a NaN close, which would otherwise
    # poison buy & hold returns and break JSON serialization.
    data = [
        d for d in data
        if d["rsi"] is not None and d["macd"] is not None and d["close"] == d["close"]
    ]

    trades = []
    position = None
    equity = INITIAL_CAPITAL
    equity_curve = [{"timestamp": _to_iso(data[0]["date"]), "equity": equity}] if data else []

    for day in data:
        rsi = day["rsi"]
        close = day["close"]
        date = day["date"]
        macd = day["macd"]
        macd_signal = day["macd_signal"]

        # Define buy/sell signals based on strategy
        if strategy == "rsi":
            buy_signal = rsi < buy_rsi
            sell_signal = rsi > sell_rsi

        elif strategy == "macd":
            buy_signal = macd > macd_signal
            sell_signal = macd < macd_signal

        elif strategy == "combined":
            buy_signal = rsi < buy_rsi and macd > macd_signal
            sell_signal = rsi > sell_rsi or macd < macd_signal

        elif strategy == "golden_cross":
            sma_20 = day["sma_20"]
            sma_50 = day["sma_50"]
            if sma_20 is None or sma_50 is None:
                continue
            buy_signal = sma_20 > sma_50
            sell_signal = sma_20 < sma_50

        else:
            return {"error": f"Unknown strategy: {strategy}"}

        if position is None and buy_signal:
            position = {"buy_date": date, "buy_price": close}
        elif position is not None and sell_signal:
            return_pct = round((close - position["buy_price"]) / position["buy_price"] * 100, 2)
            equity_before = equity
            equity *= (1 + return_pct / 100)
            pnl = round(equity - equity_before, 2)
            trades.append({
                "buy_date": position["buy_date"],
                "buy_price": position["buy_price"],
                "sell_date": date,
                "sell_price": close,
                "return_pct": return_pct,
                "pnl": pnl,
                "equity_after": round(equity, 2),
                "win": return_pct > 0
            })
            equity_curve.append({"timestamp": _to_iso(date), "equity": round(equity, 2)})
            position = None

    if not trades:
        return {"error": "No trades were triggered with these parameters"}

    # Total return is the compounded growth of capital across all trades, not
    # the sum of per-trade percentages (which overstates results and can show a
    # gain when the compounded equity actually ended underwater).
    total_return = round((equity - INITIAL_CAPITAL) / INITIAL_CAPITAL * 100, 2)
    win_rate = round(sum(1 for t in trades if t["win"]) / len(trades) * 100, 2)
    best_trade = max(trades, key=lambda t: t["return_pct"])
    worst_trade = min(trades, key=lambda t: t["return_pct"])

    # Buy & hold benchmark (same ticker) and SPY benchmark (the market),
    # both mapped onto the strategy's equity-curve timestamps so they overlay
    # directly on the chart.
    close_by_date = {d["date"]: d["close"] for d in data}
    buy_hold_curve = _benchmark_curve(equity_curve, close_by_date)
    buy_hold_return = round((buy_hold_curve[-1]["equity"] - INITIAL_CAPITAL) / INITIAL_CAPITAL * 100, 2) if buy_hold_curve else None

    try:
        spy_hist = get_history("SPY", period=period)
        spy_by_date = {d["date"]: d["close"] for d in spy_hist}
        spy_curve = _benchmark_curve(equity_curve, spy_by_date)
        spy_return = round((spy_curve[-1]["equity"] - INITIAL_CAPITAL) / INITIAL_CAPITAL * 100, 2) if spy_curve else None
    except Exception:
        spy_curve = []
        spy_return = None

    # Max drawdown: largest peak-to-trough decline of the strategy equity curve
    peak = -float("inf")
    max_drawdown = 0.0
    for point in equity_curve:
        peak = max(peak, point["equity"])
        drawdown = (point["equity"] - peak) / peak * 100
        max_drawdown = min(max_drawdown, drawdown)

    return {
        "ticker": ticker.upper(),
        "period": period,
        "strategy": strategy,
        "buy_rsi": buy_rsi,
        "sell_rsi": sell_rsi,
        "total_return_pct": total_return,
        "num_trades": len(trades),
        "win_rate_pct": win_rate,
        "max_drawdown_pct": round(max_drawdown, 2),
        "buy_hold_return_pct": buy_hold_return,
        "spy_return_pct": spy_return,
        "best_trade": best_trade,
        "worst_trade": worst_trade,
        "trades": trades,
        "initial_capital": INITIAL_CAPITAL,
        "equity_curve": equity_curve,
        "buy_hold_curve": buy_hold_curve,
        "spy_curve": spy_curve,
    }