"""Regression tests for the _frange DoS.

_frange used to build the full list before the MAX_SWEEP_CELLS cap was
checked, so a request like buy_step=0.0001 over a huge range materialized
billions of entries and hung the worker on public, unauthenticated
/sweep and /validate. The fix bounds _frange so an oversized axis short-
circuits and the existing cap rejects the request.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import prices
from app.api.prices import MAX_SWEEP_CELLS, _frange

# The pathological input from the report. If _frange were still unbounded,
# importing/collecting this module would hang here — so it doubles as the
# regression guard.
DOS_LEN = len(_frange(0, 1_000_000, 0.0001))


def test_frange_is_bounded_on_hostile_input():
    # Never builds more than one past the cap, regardless of range/step.
    assert DOS_LEN <= MAX_SWEEP_CELLS + 1


def test_frange_normal_ranges_unchanged():
    # The fix must not perturb legitimate sweeps.
    assert _frange(20, 40, 5) == [20, 25, 30, 35, 40]
    assert _frange(60, 80, 5) == [60, 65, 70, 75, 80]
    assert _frange(30, 30, 5) == [30]
    assert _frange(20, 40, 0) == []
    assert _frange(20, 40, -5) == []


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(prices.router)
    return TestClient(app)


@pytest.mark.parametrize("path", ["/sweep/AAPL", "/validate/AAPL"])
def test_dos_request_is_rejected_fast(client, path):
    # Reaches the cap and returns the error WITHOUT hitting run_sweep/yfinance:
    # the size guard returns before any network call, and _frange no longer
    # hangs building the axis.
    resp = client.get(path, params={"buy_min": 0, "buy_max": 1_000_000, "buy_step": 0.0001})
    assert resp.status_code == 200
    assert "too large" in resp.json()["error"]
