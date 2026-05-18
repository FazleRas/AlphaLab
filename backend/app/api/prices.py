from fastapi import APIRouter, Query
from app.services.market_data import get_multiple_prices

router = APIRouter()

@router.get("/prices")
def prices(tickers: str = Query(...)):
    ticker_list = [t.strip().upper() for t in tickers.split(",")]

    return {
        "data": get_multiple_prices(ticker_list)
    }