# AlphaLab

A full-stack trading analytics platform with real-time market data, technical indicators, interactive charts, a multi-ticker signal scanner, and a multi-strategy backtesting engine with benchmark comparison and parameter optimization.

## Live Demo

- **Frontend:** https://alphalab-lime.vercel.app
- **Backend API:** https://alphalab-backend.onrender.com/docs

## Features

- Real-time stock quotes with intraday price change and % move
- OHLCV historical data across multiple timeframes (1mo → max)
- Technical indicators — SMA20, SMA50, RSI, MACD calculated from scratch using pandas
- Signal engine with bullish/bearish trend detection, MACD crossovers, RSI extremes
- Multi-ticker scanner with composable signal filters
- Interactive price chart with SMA overlays, line/bar toggle, timeframe selector, percent change on hover, and a **two-point measurement tool** (click any two points to measure the % / $ / day move between them)
- Multi-strategy backtesting engine — RSI, MACD, combined RSI+MACD, and golden cross
- **Equity curve** with underwater drawdown shading, plus **buy & hold and SPY benchmark overlays** so you can see the strategy's margin over just holding the stock or the market
- **Risk & performance metrics** — total return (compounded), annualized return (CAGR), annualized Sharpe ratio, max drawdown, win rate
- Trade history with per-trade dollar P&L and running account balance
- **Parameter sweep** — backtest a grid of RSI thresholds in one request and view the results as a color-coded heatmap; click any cell to drill into its full backtest
- **Out-of-sample validation** — optimize on the first ~70% of history, then re-test the winners blind on the held-out ~30% with an honest HELD UP / LAGGED / DEGRADED verdict per combo
- **Shareable backtest URLs** — every run is encoded in the query string, so a link opens straight to that backtest or sweep
- **CSV export** of the full trade history
- **Per-user watchlist with auth** — sign in (Supabase email/password) and save a personal watchlist that persists across sessions, secured per-user with Row-Level Security
- Bloomberg-style dark UI built in React + Tailwind

## Backtesting, Parameter Sweep & Validation

The backtester reports compounded total return, **CAGR**, an **annualized Sharpe ratio** (daily mark-to-market returns, 0% risk-free), max drawdown, and win rate, with a benchmark comparison against both buy & hold of the same ticker and SPY.

The **parameter sweep** runs the strategy across every combination of `buy_rsi` × `sell_rsi` in a single request — fetching price data once and re-running the in-memory simulation per combination — and renders them as a heatmap (green = better, red = worse) that can be colored by return, Sharpe, or win rate.

It's also an overfitting check, in two layers. First, the heatmap itself: a *region* of green cells points to a robust edge, while a single green cell in a field of red is a sign of curve-fitting to noise. Second, **out-of-sample validation**: one click splits the history ~70/30 by date, re-optimizes on the train window only, then runs the top combos blind on the test window they never saw — showing train vs. test return and Sharpe side by side with a verdict against the test window's buy & hold. Indicators are computed over the full series before slicing (rolling windows only look backward), so there's no lookahead leak. Metrics remain single-ticker with no transaction costs and a 0% risk-free rate, so even a validated "best" is a starting point for analysis, not a prediction.

## API Endpoints

- `GET /prices?tickers=AAPL,TSLA,NVDA` — latest closes for multiple tickers
- `GET /history/{ticker}?period=3mo` — OHLCV candle data across multiple timeframes
- `GET /quote/{ticker}` — price, day change, high/low, volume, market cap, PE ratio
- `GET /indicators/{ticker}?period=6mo` — SMA20, SMA50, RSI, MACD alongside daily closes
- `GET /signals/{ticker}` — boolean signal snapshot (bullish trend, RSI overbought/oversold, MACD crossover)
- `GET /scan?tickers=AAPL,NVDA,TSLA&bullish_trend=true` — multi-ticker scanner, filters by active signals
- `GET /backtest/{ticker}?strategy=rsi&period=2y&buy_rsi=30&sell_rsi=70` — backtest a strategy; returns metrics, equity curve, buy & hold and SPY benchmark curves, and full trade history
- `GET /sweep/{ticker}?strategy=rsi&period=2y` — run a `buy_rsi` × `sell_rsi` grid in one request, returning per-cell metrics and the best combination (rsi / combined strategies)
- `GET /validate/{ticker}?strategy=rsi&period=2y&split=0.7&top_n=3` — out-of-sample validation: sweep the train window, re-run the top combos on the held-out test window, and return train vs. test metrics per combo

## Tech Stack

**Backend**
- Python + FastAPI
- yfinance + pandas
- Uvicorn
- Docker

**Frontend**
- React
- Tailwind CSS
- Recharts

**Auth & persistence**
- Supabase (Postgres + Auth) — email/password auth and a per-user watchlist table protected by Row-Level Security

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

The frontend targets the deployed backend by default; set `REACT_APP_API_URL=http://localhost:8000` to point it at a local one.

## Supabase Setup (watchlist & auth)

The watchlist tab is backed by Supabase. To enable it:

1. Create a free project at [supabase.com](https://supabase.com).
2. In the dashboard, open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the
   `watchlist` table and its Row-Level Security policies.
3. Copy your project's **URL** and **anon/public key** from **Project Settings → API**.
4. In `frontend/`, copy `.env.example` to `.env.local` and fill in
   `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY`.
5. (For local testing without email) Under **Authentication → Sign In / Providers → Email**,
   turn off **Confirm email** so sign-ups are usable immediately.

Without these variables the app still runs — the watchlist tab simply shows a
"not configured" note and the other tabs are unaffected.

## Status

Active development — per-user watchlists with Supabase auth just landed. Next up:
sharing watchlists and syncing scanner results into a saved view.
