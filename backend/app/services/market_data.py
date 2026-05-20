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
    return {
        "price": info.get("currentPrice"),
        "day_high": info.get("dayHigh"),
        "day_low": info.get("dayLow"),
        "volume": info.get("volume"),
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
    
    return [
        {
            "date": str(index.date()),
            "close": round(float(row["Close"]), 2),
            "sma_20": None if str(row["sma_20"]) == "nan" else row["sma_20"],
            "sma_50": None if str(row["sma_50"]) == "nan" else row["sma_50"],
            "rsi": None if str(row["rsi"]) == "nan" else row["rsi"],
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
        },
        "rsi": rsi,
        "sma_20": sma_20,
        "sma_50": sma_50,
    }