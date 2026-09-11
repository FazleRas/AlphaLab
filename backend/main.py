from __future__ import annotations

import os
import re
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

# Browser origins allowed to call the API. Auth is a bearer JWT rather than a
# cookie and allow_credentials is off, so a wildcard would widen no CSRF
# surface today - but it was a default nobody chose, and defaults that happen
# to be safe stop being safe when the auth model changes. Override with
# ALLOWED_ORIGINS (comma-separated) and ALLOWED_ORIGIN_REGEX; the regex
# default admits Vercel preview deployments of this project.
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "ALLOWED_ORIGINS",
        "https://alphalab-lime.vercel.app,http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if o.strip()
]
ALLOWED_ORIGIN_REGEX = os.environ.get(
    "ALLOWED_ORIGIN_REGEX", r"^https://alphalab(-[a-z0-9-]+)?\.vercel\.app$"
)
_origin_re = re.compile(ALLOWED_ORIGIN_REGEX) if ALLOWED_ORIGIN_REGEX else None


def _origin_allowed(origin: str | None) -> bool:
    if not origin:
        return False
    if origin in ALLOWED_ORIGINS:
        return True
    return bool(_origin_re and _origin_re.match(origin))


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX or None,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception):
    # Unhandled exceptions are answered by Starlette's outermost error
    # middleware, which bypasses CORSMiddleware - the browser then blocks the
    # 500 entirely and the frontend can only guess "is the backend down?".
    # Answer with JSON and an explicit CORS header for allowed origins so the
    # UI can show what actually failed.
    #
    # Yahoo intermittently answers with 429 even for unknown tickers; match
    # by name so this doesn't depend on yfinance's exception module layout.
    origin = request.headers.get("origin")
    headers = {"Access-Control-Allow-Origin": origin, "Vary": "Origin"} if _origin_allowed(origin) else {}
    if "RateLimit" in type(exc).__name__:
        return JSONResponse(
            status_code=503,
            content={"detail": "The market data source is rate limiting requests. Try again in a moment."},
            headers=headers,
        )
    return JSONResponse(
        status_code=500,
        content={"detail": f"internal error: {type(exc).__name__}"},
        headers=headers,
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
