import yfinance as yf

def get_price(ticker:str):
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