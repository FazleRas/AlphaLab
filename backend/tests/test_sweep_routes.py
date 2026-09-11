"""End-to-end tests for the async sweep endpoints.

Runs the real router + background task through FastAPI's TestClient on a
minimal app (just the prices router — no DB/auth startup), with yfinance
monkeypatched to a deterministic synthetic series and a fresh in-memory
store per test. TestClient executes background tasks before the request
returns, so by the time POST answers, the sweep has already run — the
polling contract is asserted on its terminal state.
"""

import types

import numpy as np
import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import prices
from app.services import market_data, sweep_store
from app.services.sweep_store import InMemorySweepStore

N_BARS = 300


@pytest.fixture
def client(monkeypatch):
    rng = np.random.default_rng(42)
    close = 100 + np.cumsum(rng.normal(0, 1, N_BARS))
    df = pd.DataFrame(
        {"Close": close},
        index=pd.date_range("2024-01-02", periods=N_BARS, freq="B"),
    )

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period=None):
            return df.copy()

    monkeypatch.setattr(market_data, "yf", types.SimpleNamespace(Ticker=FakeTicker))
    monkeypatch.setattr(sweep_store, "_store", InMemorySweepStore())

    app = FastAPI()
    app.include_router(prices.router)
    return TestClient(app)


SWEEP_PARAMS = {
    "period": "max",
    "buy_min": 40, "buy_max": 50, "buy_step": 5,
    "sell_min": 55, "sell_max": 60, "sell_step": 5,
}


def test_start_then_poll_reaches_done(client):
    started = client.post("/sweeps/TEST", params=SWEEP_PARAMS).json()
    assert started["status"] == "pending"
    assert started["total"] == 6  # 3 buy values x 2 sell values

    state = client.get(f"/sweeps/{started['sweep_id']}").json()
    assert state["status"] == "done"
    assert state["completed"] == state["total"] == 6
    assert len(state["results"]) == 6
    assert state["best"] is not None
    assert state["params_grid"]["ticker"] == "TEST"
    assert state["error"] is None


def test_poll_unknown_sweep_is_404(client):
    assert client.get("/sweeps/deadbeef").status_code == 404
    assert client.delete("/sweeps/deadbeef").status_code == 404


def test_cancel_after_done_is_noop(client):
    sweep_id = client.post("/sweeps/TEST", params=SWEEP_PARAMS).json()["sweep_id"]
    cancelled = client.delete(f"/sweeps/{sweep_id}").json()
    assert cancelled["status"] == "done"  # terminal state wins over the cancel


def test_rejects_bad_grids_before_creating_state(client):
    bad_range = client.post("/sweeps/TEST", params={**SWEEP_PARAMS, "buy_step": 0}).json()
    assert bad_range["error"] == "Invalid sweep range"

    too_big = client.post(
        "/sweeps/TEST",
        params={**SWEEP_PARAMS, "buy_min": 1, "buy_max": 99, "buy_step": 1,
                "sell_min": 1, "sell_max": 99, "sell_step": 1},
    ).json()
    assert "too large" in too_big["error"]

    bad_strategy = client.post(
        "/sweeps/TEST", params={**SWEEP_PARAMS, "strategy": "golden_cross"}
    ).json()
    assert "only supported" in bad_strategy["error"]
