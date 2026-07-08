from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.prices import router as price_router
from app.api.watchlist import router as watchlist_router
from app.api.saved_runs import router as saved_runs_router
from app.db import init_pool, close_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(price_router)
app.include_router(watchlist_router)
app.include_router(saved_runs_router)


@app.get("/")
def home():
    return {"status": "AlphaLab running"}
