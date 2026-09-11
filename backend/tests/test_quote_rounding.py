"""Quote and price values must be rounded on every fetch path.

Regression: once Yahoo's quoteSummary API started rate-limiting Render,
/quote served from the fast_info fallback, whose values carry float32
precision — the dashboard showed $326.57000732421875. The .info path returns
Yahoo's already-rounded figures, so the two paths rendered differently
depending on which one happened to answer.
"""

import types

import pandas as pd
import pytest

from app.services import market_data

# What fast_info actually hands back for a $326.57 print.
FLOAT32_PRICE = 326.57000732421875


class FakeFastInfo:
    last_price = FLOAT32_PRICE
    open = 316.6700134277344
    regular_market_previous_close = 315.3399963378906
    day_high = 326.739990234375
    day_low = 316.510009765625
    last_volume = 69925100.0
    market_cap = 4766021469490.967

    @property
    def exploding(self):
        raise KeyError("not available")


class FakeTicker:
    def __init__(self, ticker):
        self.fast_info = FakeFastInfo()

    @property
    def info(self):
        raise RuntimeError("429 Too Many Requests")

    def history(self, period=None):
        return pd.DataFrame(
            {"Close": [FLOAT32_PRICE]},
            index=pd.date_range("2026-09-10", periods=1),
        )


@pytest.fixture
def fake_yf(monkeypatch):
    monkeypatch.setattr(market_data, "yf", types.SimpleNamespace(Ticker=FakeTicker))
    # Bypass the cache so each test fetches.
    monkeypatch.setattr(market_data, "cache_json", lambda key, ttl, fn, **kw: fn())


def test_fallback_quote_is_rounded(fake_yf):
    q = market_data.get_quote("AAPL")
    assert q["price"] == 326.57
    assert q["open"] == 316.67
    assert q["previous_close"] == 315.34
    assert q["day_high"] == 326.74
    assert q["day_low"] == 316.51
    assert q["change"] == 11.23
    assert q["change_pct"] == 3.56
    # counts are whole numbers, never 69925100.0
    assert q["volume"] == 69925100 and isinstance(q["volume"], int)
    assert q["market_cap"] == 4766021469491 and isinstance(q["market_cap"], int)
    assert q["pe_ratio"] is None


def test_price_endpoint_is_rounded(fake_yf):
    assert market_data.get_price("AAPL") == 326.57
    assert market_data.get_multiple_prices(["AAPL"]) == {"AAPL": 326.57}


def test_fast_attr_degrades_missing_fields_to_none():
    fi = FakeFastInfo()
    assert market_data._fast_attr(fi, "exploding") is None
    assert market_data._fast_attr(fi, "does_not_exist") is None
    fi.last_price = float("nan")
    assert market_data._fast_attr(fi, "last_price") is None
