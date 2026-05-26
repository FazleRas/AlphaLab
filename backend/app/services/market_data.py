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
            "macd": None if str(row["macd"]) == "nan" else row["macd"],            "macd_signal": None if str(row["macd_signal"]) == "nan" else row["macd_signal"],
            "macd_histogram": None if str(row["macd_histogram"]) == "nan" else row["macd_histogram"],
        }
        for index, row in data.iterrows()
    ]

def get_signals(ticker: str):
    data = get_indicators(ticker, period="6mo")
    
    # grab the most recent day that has full indicator data
    latest = next((d for d in reversed(data) if d["rsi"] is not None), None)
    
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

def run_backtest(ticker: str, period: str, buy_rsi: float, sell_rsi: float):
    data = get_indicators(ticker, period=period)
    data = [d for d in data if d["rsi"] is not None]

    trades = []
    position = None

    for day in data:
        rsi = day["rsi"]
        close = day["close"]
        date = day["date"]

        if position is None and rsi < buy_rsi:
            position = {"buy_date": date, "buy_price": close}

        elif position is not None and rsi > sell_rsi:
            return_pct = round((close - position["buy_price"]) / position["buy_price"] * 100, 2)
            trades.append({
                "buy_date": position["buy_date"],
                "buy_price": position["buy_price"],
                "sell_date": date,
                "sell_price": close,
                "return_pct": return_pct,
                "win": return_pct > 0
            })
            position = None

    if not trades:
        return {"error": "No trades were triggered with these parameters"}

    total_return = round(sum(t["return_pct"] for t in trades), 2)
    win_rate = round(sum(1 for t in trades if t["win"]) / len(trades) * 100, 2)
    best_trade = max(trades, key=lambda t: t["return_pct"])
    worst_trade = min(trades, key=lambda t: t["return_pct"])

    return {
        "ticker": ticker.upper(),
        "period": period,
        "buy_rsi": buy_rsi,
        "sell_rsi": sell_rsi,
        "total_return_pct": total_return,
        "num_trades": len(trades),
        "win_rate_pct": win_rate,
        "best_trade": best_trade,
        "worst_trade": worst_trade,
        "trades": trades,
    }