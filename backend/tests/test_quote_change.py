"""Regression tests for the day-change baseline on /quote.

Day change used to be measured against the day's OPEN rather than the previous
session's close, which drops the overnight gap. Reported against AAPL: a price
of 332.03 with a 333.13 open and a 338.20 previous close showed -1.10 / -0.33%
where every other quote source showed -6.10 / -1.80%.

The bug was invisible whenever a stock opened flat and grew to exactly the size
of the gap otherwise, which is why it survived. Both quote paths had it:
_fetch_quote (Yahoo's .info) and _fallback_quote (fast_info, used when .info is
rate limited), so these cover both.
"""

import types

from app.services import market_data
from app.services.market_data import _fallback_quote, _fetch_quote

# The numbers from the report.
PRICE = 332.03
OPEN = 333.13
PREV_CLOSE = 338.20

EXPECTED_CHANGE = round(PRICE - PREV_CLOSE, 2)
EXPECTED_PCT = round((PRICE - PREV_CLOSE) / PREV_CLOSE * 100, 2)


def _patch_info(monkeypatch, info):
    class FakeTicker:
        def __init__(self, ticker):
            self.ticker = ticker

        @property
        def info(self):
            return info

    monkeypatch.setattr(market_data, "yf", types.SimpleNamespace(Ticker=FakeTicker))


def _fast_info(**overrides):
    fields = {
        "last_price": PRICE,
        "open": OPEN,
        "regular_market_previous_close": PREV_CLOSE,
        "day_high": None,
        "day_low": None,
        "last_volume": None,
        "market_cap": None,
    }
    fields.update(overrides)
    return types.SimpleNamespace(**fields)


def test_info_path_measures_from_previous_close(monkeypatch):
    _patch_info(monkeypatch, {
        "currentPrice": PRICE,
        "regularMarketOpen": OPEN,
        "regularMarketPreviousClose": PREV_CLOSE,
    })

    quote = _fetch_quote("AAPL")

    assert quote["previous_close"] == PREV_CLOSE
    assert quote["change"] == EXPECTED_CHANGE
    assert quote["change_pct"] == EXPECTED_PCT
    # What the bug produced: the move measured from the open.
    assert quote["change"] != round(PRICE - OPEN, 2)


def test_fallback_path_measures_from_previous_close():
    quote = _fallback_quote(types.SimpleNamespace(fast_info=_fast_info()), "AAPL")

    assert quote["previous_close"] == PREV_CLOSE
    assert quote["change"] == EXPECTED_CHANGE
    assert quote["change_pct"] == EXPECTED_PCT


def test_both_paths_agree(monkeypatch):
    # The fallback exists so a rate-limited .info degrades instead of failing.
    # It must not also change the number the user sees.
    _patch_info(monkeypatch, {
        "currentPrice": PRICE,
        "regularMarketOpen": OPEN,
        "regularMarketPreviousClose": PREV_CLOSE,
    })
    via_info = _fetch_quote("AAPL")
    via_fast = _fallback_quote(types.SimpleNamespace(fast_info=_fast_info()), "AAPL")

    assert via_info["change"] == via_fast["change"]
    assert via_info["change_pct"] == via_fast["change_pct"]


def test_flat_day_reports_zero_rather_than_null(monkeypatch):
    # `if change and prev_close` treated a real 0.0 move as a missing value, so
    # an unchanged stock reported a null percent instead of 0.0.
    _patch_info(monkeypatch, {
        "currentPrice": PREV_CLOSE,
        "regularMarketOpen": PREV_CLOSE,
        "regularMarketPreviousClose": PREV_CLOSE,
    })

    quote = _fetch_quote("AAPL")

    assert quote["change"] == 0.0
    assert quote["change_pct"] == 0.0


def test_missing_previous_close_degrades_to_none(monkeypatch):
    # No baseline means no honest change figure; report nothing rather than
    # silently falling back to the open.
    _patch_info(monkeypatch, {
        "currentPrice": PRICE,
        "regularMarketOpen": OPEN,
    })

    quote = _fetch_quote("AAPL")

    assert quote["price"] == PRICE
    assert quote["change"] is None
    assert quote["change_pct"] is None
