# AlphaLab 📊

A lightweight backend API for fetching real-time stock market data, built as a foundation for trading analytics and simulation tools.

## Current Endpoints

- `GET /price/{ticker}` — get the latest close for a single stock
- `GET /prices?tickers=AAPL,TSLA,NVDA` — get closes for multiple tickers at once

## Tech Stack

- Python + FastAPI
- yfinance
- Uvicorn

## Run Locally

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```

Then visit `http://127.0.0.1:8000/docs` for the interactive API docs.

## Status

Still in development - eventually going to be a trading analytics platform.
