from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.prices import router as price_router
from app.api.watchlist import router as watchlist_router
from app.api.saved_runs import router as saved_runs_router
from app.cache import stats as cache_stats
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

@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception):
    # Unhandled exceptions are answered by Starlette's outermost error
    # middleware, which bypasses CORSMiddleware - the browser then blocks the
    # 500 entirely and the frontend can only guess "is the backend down?".
    # Answer with JSON and an explicit CORS header (safe: we serve "*" with
    # credentials disabled) so the UI can show what actually failed.
    return JSONResponse(
        status_code=500,
        content={"detail": f"internal error: {type(exc).__name__}"},
        headers={"Access-Control-Allow-Origin": "*"},
    )


app.include_router(price_router)
app.include_router(watchlist_router)
app.include_router(saved_runs_router)


@app.get("/")
def home():
    return {"status": "AlphaLab running"}


@app.get("/cache-stats")
def cache_statistics():
    return cache_stats()
