"""
Lookahead-bias correctness tests for AlphaLab.

THE CORE INVARIANT
------------------
Anything computed "as of" bar t must be IDENTICAL whether or not bars after t
exist. If adding (or mutating) future data changes a past value, you have
lookahead bias and your Sharpe is lying to you.

HOW THIS MAPS ONTO ALPHALAB'S ACTUAL LAYOUT
-------------------------------------------
- Indicators are computed inside `_fetch_indicators(ticker, period)` in
  app/services/market_data.py, which also does the yfinance I/O. These tests
  monkeypatch `market_data.yf` so the REAL indicator code runs over a
  deterministic synthetic series — no network. Calling the private
  `_fetch_*` / `_simulate` functions also means `cache_json` never engages,
  so no redis needed either.
- The "signal layer" and the backtest engine are one function:
  `_simulate(rows, strategy, buy_rsi, sell_rsi)` — a pure sequential loop
  over row dicts. Families 2 and 3 therefore assert on its trades/equity
  output rather than a standalone signal series.
- `get_signals` (the latest-bar crossover detector) only looks at the last
  two rows and is causal by construction; it goes through the cache/network
  path so it is not exercised here.

Three test families:

1. TRUNCATION INVARIANCE (indicators)
   Rows computed on a prefix of the price history must equal the same rows
   computed on the full history. Catches centered windows, full-series
   normalization, .shift(-1), etc.

2. FUTURE PERTURBATION (signals → trades)
   Nuke every bar after t. Trades closed at-or-before t, and the equity
   curve up to t, must not change.

3. FILL TIMING (engine)
   A buy decided using bar t's close (RSI needs the close to exist) must not
   fill AT bar t's close. Standard convention: decide on t, fill on t+1.
   `_simulate` currently fills on the decision bar itself, so this test is
   xfail(strict=True) — it documents the engine's same-bar-close execution
   model. If you fix the engine to fill next-bar, remove the xfail. If
   same-bar-close is the intended model, rewrite the assertion to pin it.
   Plus the nuke-from-orbit variant: full-simulation equity curves must be
   truncation-invariant.

Run from backend/:  python -m pytest tests/ -v
"""

import types

import numpy as np
import pandas as pd
import pytest

from app.services import market_data
from app.services.market_data import _clean_indicators, _fetch_indicators, _simulate

N_BARS = 300
# Cut points to test truncation at. Early, middle, late — cheap insurance.
# (Earliest is 60 so sma_50/RSI warmup is behind us and trades exist.)
CUT_POINTS = [60, 150, 299]

INDICATOR_COLS = ["sma_20", "sma_50", "rsi", "macd", "macd_signal", "macd_histogram"]
STRATEGIES = ["rsi", "macd", "combined", "golden_cross"]

# Thresholds loose enough that the RSI strategies actually trade on a
# seeded random walk; the invariants hold for any values.
BUY_RSI, SELL_RSI = 45, 55


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

@pytest.fixture
def history() -> pd.DataFrame:
    """Deterministic synthetic yfinance-shaped history. Seeded so failures
    reproduce exactly."""
    rng = np.random.default_rng(42)
    close = 100 + np.cumsum(rng.normal(0, 1, N_BARS))
    idx = pd.date_range("2024-01-02", periods=N_BARS, freq="B")
    return pd.DataFrame(
        {
            "Open": close + rng.normal(0, 0.3, N_BARS),
            "High": close + rng.uniform(0, 1, N_BARS),
            "Low": close - rng.uniform(0, 1, N_BARS),
            "Close": close,
            "Volume": rng.integers(1_000, 100_000, N_BARS).astype(float),
        },
        index=idx,
    )


def _raw_rows(df: pd.DataFrame, monkeypatch) -> list[dict]:
    """Run the real _fetch_indicators over a synthetic frame (no network)."""

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period=None):
            return df.copy()

    monkeypatch.setattr(market_data, "yf", types.SimpleNamespace(Ticker=FakeTicker))
    return _fetch_indicators("TEST", "max")


def _sim_rows(df: pd.DataFrame, monkeypatch) -> list[dict]:
    return _clean_indicators(_raw_rows(df, monkeypatch))


def _assert_value_equal(a, b, ctx: str):
    if a is None or b is None:
        assert a is None and b is None, f"{ctx}: {a!r} != {b!r}"
    else:
        assert a == pytest.approx(b, abs=1e-9), f"{ctx}: {a!r} != {b!r}"


def _trades_through(sim: dict, cut_date: str) -> list[dict]:
    if "error" in sim:
        return []
    return [t for t in sim["trades"] if t["sell_date"] <= cut_date]


def _curve_through(sim: dict, cut_ts: str) -> list[dict]:
    if "error" in sim:
        return []
    return [p for p in sim["equity_curve"] if p["timestamp"] <= cut_ts]


# ---------------------------------------------------------------------------
# Family 1: truncation invariance (indicators)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("t", CUT_POINTS)
def test_indicator_truncation_invariance(history, monkeypatch, t):
    """Indicators on df[:t] must equal indicators on full df, up to row t."""
    full = _raw_rows(history, monkeypatch)
    trunc = _raw_rows(history.iloc[:t], monkeypatch)

    assert len(trunc) == t
    for i, (a, b) in enumerate(zip(full[:t], trunc)):
        assert a["date"] == b["date"]
        for col in ["close", *INDICATOR_COLS]:
            _assert_value_equal(a[col], b[col], f"{col} truncated@{t}, row {i}")


# ---------------------------------------------------------------------------
# Family 2: future perturbation (signals → trades)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("strategy", STRATEGIES)
@pytest.mark.parametrize("t", CUT_POINTS[:-1])  # can't perturb after the last bar
def test_trades_immune_to_future(history, monkeypatch, strategy, t):
    """Mutating bars AFTER t must not change any trade closed at-or-before t,
    nor the equity curve up to t."""
    baseline_rows = _sim_rows(history, monkeypatch)

    corrupted = history.copy()
    price_cols = ["Open", "High", "Low", "Close"]
    corrupted.iloc[t:, corrupted.columns.get_indexer(price_cols)] *= 7.77
    corrupted.iloc[t:, corrupted.columns.get_loc("Volume")] = 1.0
    corrupted_rows = _sim_rows(corrupted, monkeypatch)

    base = _simulate(baseline_rows, strategy, BUY_RSI, SELL_RSI)
    pert = _simulate(corrupted_rows, strategy, BUY_RSI, SELL_RSI)

    cut_date = str(history.index[t - 1].date())
    assert _trades_through(base, cut_date) == _trades_through(pert, cut_date), (
        f"{strategy}: trades before {cut_date} changed when the future was corrupted"
    )
    cut_ts = market_data._to_iso(cut_date)
    assert _curve_through(base, cut_ts) == _curve_through(pert, cut_ts), (
        f"{strategy}: equity curve before {cut_date} changed when the future was corrupted"
    )


# ---------------------------------------------------------------------------
# Family 3: fill timing (engine-level)
# ---------------------------------------------------------------------------

@pytest.mark.xfail(
    strict=True,
    reason=(
        "_simulate fills at the decision bar's own close: the buy signal needs "
        "bar t's close (RSI(t) is computed from it), yet the fill price IS bar "
        "t's close. Standard convention is decide on t, fill on t+1. Remove "
        "this xfail once the engine fills next-bar; rewrite the assertion if "
        "same-bar-close is the intended execution model."
    ),
)
def test_fills_use_next_bar_prices(history, monkeypatch):
    """The first buy must fill strictly AFTER the bar whose data triggered it."""
    rows = _sim_rows(history, monkeypatch)
    sim = _simulate(rows, "rsi", BUY_RSI, SELL_RSI)
    assert "error" not in sim, sim.get("error")

    # First buy decision is convention-independent: no position exists yet, so
    # the first bar with rsi < BUY_RSI is where the signal fires under any
    # execution model.
    first_decision = next(i for i, r in enumerate(rows) if r["rsi"] < BUY_RSI)

    first_trade = sim["trades"][0]
    fill_bar = next(i for i, r in enumerate(rows) if r["date"] == first_trade["buy_date"])
    assert fill_bar > first_decision, (
        f"buy decided on bar {first_decision} ({rows[first_decision]['date']}) "
        f"filled on the same bar at that bar's close ({first_trade['buy_price']})"
    )


@pytest.mark.parametrize("strategy", ["rsi", "macd"])
@pytest.mark.parametrize("t", [150, 299])
def test_equity_curve_truncation_invariance(history, monkeypatch, strategy, t):
    """Nuke-from-orbit: run the FULL simulation on df[:t] and on df, and assert
    trades and equity curves match up to t. If any layer (indicator, signal,
    engine) leaks the future, this catches it."""
    full = _simulate(_sim_rows(history, monkeypatch), strategy, BUY_RSI, SELL_RSI)
    part = _simulate(_sim_rows(history.iloc[:t], monkeypatch), strategy, BUY_RSI, SELL_RSI)

    cut_date = str(history.index[t - 1].date())
    assert _trades_through(full, cut_date) == _trades_through(part, cut_date)
    cut_ts = market_data._to_iso(cut_date)
    assert _curve_through(full, cut_ts) == _curve_through(part, cut_ts)
