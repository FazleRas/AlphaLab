# AlphaLab

A full-stack trading analytics platform with real-time market data, technical indicators, an interactive price chart, and a multi-ticker signal scanner.

## Live Demo

- **Frontend:** https://alphalab-lime.vercel.app
- **Backend API:** https://alphalab-backend.onrender.com/docs

## Features

- Real-time stock quotes with intraday price change and % move
- OHLCV historical data across multiple timeframes (1mo → max)
- Technical indicators — SMA20, SMA50, RSI, MACD calculated from scratch using pandas
- Signal engine — bullish/bearish trend detection, MACD crossovers, RSI extremes
- Multi-ticker scanner with composable signal filters
- Interactive price chart with SMA overlays, line/bar toggle, and percent change on hover
- Bloomberg-style dark UI built in React + Tailwind

## API Endpoints

- `GET /price/{ticker}` — latest close for a single stock
- `GET /prices?tickers=AAPL,TSLA,NVDA` — closes for multiple tickers
- `GET /history/{ticker}?period=3mo` — OHLCV candle data across multiple timeframes
- `GET /quote/{ticker}` — price, day change, high/low, volume, market cap, PE ratio
- `GET /indicators/{ticker}?period=6mo` — SMA20, SMA50, RSI, MACD alongside daily closes
- `GET /signals/{ticker}` — boolean signal snapshot (bullish trend, RSI overbought/oversold, MACD crossover)
- `GET /scan?tickers=AAPL,NVDA,TSLA&bullish_trend=true` — multi-ticker scanner, filters by active signals

## Tech Stack

**Backend**
- Python + FastAPI
- yfinance
- Uvicorn
- Docker

**Frontend**
- React
- Tailwind CSS
- Recharts

**Deployment**
- Backend: Render (Dockerized)
- Frontend: Vercel

## Run Locally

**Backend:**
```bash
cd backend
source .venv/bin/activate
.venv/bin/python -m uvicorn main:app --reload
```

**Frontend:**
```bash
cd frontend
npm start
```

Then visit `http://127.0.0.1:8000/docs` for the interactive API docs or `http://localhost:3000` for the dashboard.

## Status

Active development — next steps include strategy backtesting engine, watchlist with database persistence.
