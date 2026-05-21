# AlphaLab

A lightweight backend API for fetching real-time stock market data, built as a foundation for trading analytics and simulation tools.

## Current Endpoints

- `GET /price/{ticker}` — latest close for a single stock
- `GET /prices?tickers=AAPL,TSLA,NVDA` — closes for multiple tickers
- `GET /history/{ticker}?period=3mo` — OHLCV candle data (1d, 1mo, 3mo, 6mo, 1y)
- `GET /quote/{ticker}` — snapshot of price, day high/low, volume, market cap, PE ratio
- `GET /indicators/{ticker}?period=6mo` — SMA20, SMA50, RSI, MACD alongside daily closes
- `GET /signals/{ticker}` — boolean signal snapshot (bullish trend, RSI overbought/oversold, MACD crossover)
- `GET /scan?tickers=AAPL,NVDA,TSLA&bullish_trend=true` — multi-ticker scanner, filters by active signals

## Tech Stack

- Python + FastAPI
- yfinance
- Uvicorn

## Run Locally

```bash
cd backend
source .venv/bin/activate
.venv/bin/python -m uvicorn main:app --reload
```

Then visit `http://127.0.0.1:8000/docs` for the interactive API docs.

## Status

Active development — evolving into a full trading analytics and simulation platform.
