import statistics
from datetime import date as _date

import yfinance as yf

TRADING_DAYS_PER_YEAR = 252

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

def _clean_indicators(data):
    # Drop rows missing indicators or a close price. yfinance includes the
    # current (incomplete) trading day with a NaN close, which would otherwise
    # poison buy & hold returns and break JSON serialization.
    return [
        d for d in data
        if d["rsi"] is not None and d["macd"] is not None and d["close"] == d["close"]
    ]

def _simulate(rows, strategy: str, buy_rsi: float = 30, sell_rsi: float = 70):
    """Pure backtest simulation over already-fetched, cleaned indicator rows.
    No I/O — safe to call many times (e.g. a parameter sweep). Returns the core
    results + metrics, or {"error": ...} on an unknown strategy / no trades."""
    trades = []
    position = None
    equity = INITIAL_CAPITAL
    equity_curve = [{"timestamp": _to_iso(rows[0]["date"]), "equity": equity}] if rows else []
    daily_equity = []  # mark-to-market each day, for Sharpe

    for day in rows:
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

        # Mark account to market each day: invested value while holding, cash otherwise.
        held = equity * (close / position["buy_price"]) if position is not None else equity
        daily_equity.append(held)

    if not trades:
        return {"error": "No trades were triggered with these parameters"}

    # Total return is the compounded growth of capital across all trades, not
    # the sum of per-trade percentages (which overstates results and can show a
    # gain when the compounded equity actually ended underwater).
    total_return = round((equity - INITIAL_CAPITAL) / INITIAL_CAPITAL * 100, 2)
    win_rate = round(sum(1 for t in trades if t["win"]) / len(trades) * 100, 2)
    best_trade = max(trades, key=lambda t: t["return_pct"])
    worst_trade = min(trades, key=lambda t: t["return_pct"])

    # Max drawdown: largest peak-to-trough decline of the strategy equity curve
    peak = -float("inf")
    max_drawdown = 0.0
    for point in equity_curve:
        peak = max(peak, point["equity"])
        drawdown = (point["equity"] - peak) / peak * 100
        max_drawdown = min(max_drawdown, drawdown)

    # CAGR: annualized compounded return over the active period (first date to
    # the last trade), consistent with total_return_pct.
    start = _date.fromisoformat(rows[0]["date"])
    end = _date.fromisoformat(trades[-1]["sell_date"])
    years = (end - start).days / 365.25
    cagr = round(((equity / INITIAL_CAPITAL) ** (1 / years) - 1) * 100, 2) if years > 0 and equity > 0 else None

    # Sharpe ratio: annualized, risk-free rate assumed 0. Uses daily mark-to-market
    # returns so the thresholds line up with the usual <0 / 0-1 / 1-2 / >2 reading.
    daily_returns = [
        daily_equity[i] / daily_equity[i - 1] - 1
        for i in range(1, len(daily_equity))
        if daily_equity[i - 1] > 0
    ]
    if len(daily_returns) >= 2 and statistics.pstdev(daily_returns) > 0:
        sharpe = round(
            statistics.mean(daily_returns) / statistics.pstdev(daily_returns) * (TRADING_DAYS_PER_YEAR ** 0.5),
            2,
        )
    else:
        sharpe = None

    return {
        "total_return_pct": total_return,
        "cagr_pct": cagr,
        "sharpe": sharpe,
        "num_trades": len(trades),
        "win_rate_pct": win_rate,
        "max_drawdown_pct": round(max_drawdown, 2),
        "best_trade": best_trade,
        "worst_trade": worst_trade,
        "trades": trades,
        "equity_curve": equity_curve,
        "final_equity": equity,
    }

def run_backtest(ticker: str, period: str, strategy: str, buy_rsi: float = 30, sell_rsi: float = 70):
    data = _clean_indicators(get_indicators(ticker, period=period))
    sim = _simulate(data, strategy, buy_rsi, sell_rsi)
    if "error" in sim:
        return sim

    # Buy & hold benchmark (same ticker) and SPY benchmark (the market), both
    # mapped onto the strategy's equity-curve timestamps so they overlay directly.
    equity_curve = sim["equity_curve"]
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

    return {
        "ticker": ticker.upper(),
        "period": period,
        "strategy": strategy,
        "buy_rsi": buy_rsi,
        "sell_rsi": sell_rsi,
        "total_return_pct": sim["total_return_pct"],
        "cagr_pct": sim["cagr_pct"],
        "sharpe": sim["sharpe"],
        "num_trades": sim["num_trades"],
        "win_rate_pct": sim["win_rate_pct"],
        "max_drawdown_pct": sim["max_drawdown_pct"],
        "buy_hold_return_pct": buy_hold_return,
        "spy_return_pct": spy_return,
        "best_trade": sim["best_trade"],
        "worst_trade": sim["worst_trade"],
        "trades": sim["trades"],
        "initial_capital": INITIAL_CAPITAL,
        "equity_curve": equity_curve,
        "buy_hold_curve": buy_hold_curve,
        "spy_curve": spy_curve,
    }

SWEEP_METRICS = ("total_return_pct", "cagr_pct", "sharpe", "win_rate_pct", "num_trades", "max_drawdown_pct")

def _metrics_cell(rows, strategy, buy_rsi, sell_rsi):
    """Run one simulation and flatten it to a metrics dict (None-filled if no trades)."""
    sim = _simulate(rows, strategy, buy_rsi, sell_rsi)
    traded = "error" not in sim
    cell = {"buy_rsi": buy_rsi, "sell_rsi": sell_rsi}
    for m in SWEEP_METRICS:
        cell[m] = sim[m] if traded else None
    return cell

def _grid_cells(rows, strategy, buy_values, sell_values):
    return [
        _metrics_cell(rows, strategy, buy_rsi, sell_rsi)
        for sell_rsi in sell_values
        for buy_rsi in buy_values
    ]

def run_sweep(ticker: str, period: str, strategy: str, buy_values, sell_values):
    """Run the strategy across a grid of (buy_rsi, sell_rsi) values, fetching
    indicators once and re-running the pure simulation per combo."""
    if strategy not in ("rsi", "combined"):
        return {"error": f"Sweep is only supported for rsi and combined strategies, not {strategy}"}

    data = _clean_indicators(get_indicators(ticker, period=period))
    if not data:
        return {"error": "Not enough data to run a sweep"}

    grid = _grid_cells(data, strategy, buy_values, sell_values)
    traded = [c for c in grid if c["total_return_pct"] is not None]
    best = max(traded, key=lambda c: c["total_return_pct"]) if traded else None
    return {
        "ticker": ticker.upper(),
        "period": period,
        "strategy": strategy,
        "buy_values": list(buy_values),
        "sell_values": list(sell_values),
        "grid": grid,
        "best": best,
    }

def run_validation(ticker: str, period: str, strategy: str, buy_values, sell_values,
                   split: float = 0.7, top_n: int = 3):
    """Out-of-sample validation: sweep the parameter grid on the earlier (train)
    slice of history, then re-run the top combos on the later (test) slice they
    never saw. Indicators are computed over the full series BEFORE slicing,
    which is causally sound (rolling windows only look backward) and avoids a
    cold warm-up gap at the start of the test window."""
    if strategy not in ("rsi", "combined"):
        return {"error": f"Validation is only supported for rsi and combined strategies, not {strategy}"}

    data = _clean_indicators(get_indicators(ticker, period=period))
    split_idx = int(len(data) * split)
    train, test = data[:split_idx], data[split_idx:]
    # Each slice needs enough rows for a strategy to plausibly trade.
    if len(train) < 60 or len(test) < 30:
        return {"error": "Not enough data to split into train and test windows"}

    train_grid = _grid_cells(train, strategy, buy_values, sell_values)
    winners = sorted(
        (c for c in train_grid if c["total_return_pct"] is not None),
        key=lambda c: c["total_return_pct"],
        reverse=True,
    )[:top_n]
    if not winners:
        return {"error": "No parameter combination traded in the train window"}

    results = [
        {
            "buy_rsi": c["buy_rsi"],
            "sell_rsi": c["sell_rsi"],
            "train": {m: c[m] for m in SWEEP_METRICS},
            "test": {m: t[m] for m in SWEEP_METRICS},
        }
        for c in winners
        for t in [_metrics_cell(test, strategy, c["buy_rsi"], c["sell_rsi"])]
    ]

    # Buy & hold over the test window, for context on what "doing nothing" earned.
    test_bh = round((test[-1]["close"] - test[0]["close"]) / test[0]["close"] * 100, 2)

    return {
        "ticker": ticker.upper(),
        "period": period,
        "strategy": strategy,
        "split": split,
        "train_start": train[0]["date"],
        "train_end": train[-1]["date"],
        "test_start": test[0]["date"],
        "test_end": test[-1]["date"],
        "test_buy_hold_return_pct": test_bh,
        "results": results,
    }