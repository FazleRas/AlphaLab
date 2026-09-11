"""The /quotes tape endpoint: fast_info only, rounded, and one bad symbol
never takes the batch down."""

import types

import pytest

from app.services import market_data


class FakeFastInfo:
    last_price = 757.83000732421875
    regular_market_previous_close = 754.6599731445312


class FakeTicker:
    def __init__(self, ticker):
        if ticker == "BAD":
            raise RuntimeError("no such symbol")
        self.fast_info = FakeFastInfo()

    @property
    def info(self):
        raise AssertionError(".info must not be touched by the tape")


@pytest.fixture
def fake_yf(monkeypatch):
    monkeypatch.setattr(market_data, "yf", types.SimpleNamespace(Ticker=FakeTicker))
    monkeypatch.setattr(market_data, "cache_json", lambda key, ttl, fn, **kw: fn())


def test_tape_quote_is_rounded_and_measured_from_previous_close(fake_yf):
    [q] = market_data.get_tape_quotes(["spy"])
    assert q == {"ticker": "SPY", "price": 757.83, "change": 3.17, "change_pct": 0.42}


def test_bad_symbol_is_skipped_not_fatal(fake_yf):
    quotes = market_data.get_tape_quotes(["SPY", "BAD", "^VIX"])
    assert [q["ticker"] for q in quotes] == ["SPY", "^VIX"]
