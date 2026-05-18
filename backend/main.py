from fastapi import FastAPI
from app.api.prices import router as price_router

app = FastAPI()

app.include_router(price_router)

@app.get("/")
def home():
    return {"status": "AlphaLab running"}