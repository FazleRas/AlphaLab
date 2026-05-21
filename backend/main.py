from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.prices import router as price_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(price_router)

@app.get("/")
def home():
    return {"status": "AlphaLab running"}