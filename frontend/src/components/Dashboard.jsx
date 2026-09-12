import { useState, useEffect } from 'react';
import PriceChart from './PriceChart';
import Sparkline, { WindowChange } from './Sparkline';
import AnimatedNumber from './AnimatedNumber';
import { QuoteSkeleton, ExampleCardSkeleton } from './Skeleton';
import useColdStartHint from '../hooks/useColdStartHint';
import useRecentTickers from '../hooks/useRecentTickers';
import { nyseOpen } from './Tape';
import API from '../config';

// Offered on the empty dashboard so the first thing on screen is a market,
// not a blank input. One /scan call covers all of them.
const EXAMPLES = ['AAPL', 'NVDA', 'TSLA', 'SPY', 'MSFT', 'AMZN'];

const LABEL = { fontSize: '10.5px', letterSpacing: '0.16em', color: 'var(--color-muted)' };

// Format at the edge regardless of what the API sends: a quote served from
// yfinance's fast_info fallback once reached the screen as
// $326.57000732421875. The backend rounds now too; this is the backstop.
const fixed2 = (v) => Number(v).toFixed(2);
const money = (v) => `$${fixed2(v)}`;
const signed2 = (v) => `${v >= 0 ? '+' : ''}${fixed2(v)}`;
const compact = (v) => {
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return fixed2(v);
};
// Quotes refresh on this cadence while the session is open; the backend
// caches them for the same minute.
const LIVE_MS = 60_000;

// Where today sits in the year: the 52-week span as a track, the day's
// range as a thicker segment, the last price as a tick.
const RangeBar = ({ low, high, dayLow, dayHigh, price, color }) => {
  if (low == null || high == null || price == null || high <= low) return null;
  const pct = (v) => Math.min(100, Math.max(0, ((v - low) / (high - low)) * 100));
  const hasDay = dayLow != null && dayHigh != null;
  return (
    <div className="mt-5">
      <div className="flex justify-between mb-1" style={LABEL}>
        <span>52W LOW {money(low)}</span>
        <span>52W HIGH {money(high)}</span>
      </div>
      <div style={{ position: 'relative', height: 6, background: 'var(--color-hairline)' }}>
        {hasDay && (
          <div
            title={`Day range ${money(dayLow)} – ${money(dayHigh)}`}
            style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${pct(dayLow)}%`, width: `${Math.max(0.6, pct(dayHigh) - pct(dayLow))}%`,
              background: 'var(--color-muted)',
            }}
          />
        )}
        <div style={{ position: 'absolute', top: -3, width: 2, height: 12, left: `calc(${pct(price)}% - 1px)`, background: color }} />
      </div>
    </div>
  );
};

const StatCard = ({ label, value, format = fixed2, color }) => (
  <div className="p-3" style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-divider)' }}>
    <p className="font-mono text-xs mb-1 tracking-widest" style={{ color: 'var(--color-muted)' }}>{label}</p>
    <p className="font-mono text-sm" style={{ color: color || 'var(--color-text)' }}>
      <AnimatedNumber value={value} format={format} empty="-" />
    </p>
  </div>
);

const rsiColor = (rsi) => {
  if (!rsi) return 'var(--color-text)';
  if (rsi > 70) return 'var(--color-neg)';
  if (rsi < 30) return 'var(--color-pos)';
  return 'var(--color-text)';
};

const macdColor = (histogram) => {
  if (!histogram) return 'var(--color-text)';
  return histogram > 0 ? 'var(--color-pos)' : 'var(--color-neg)';
};

// Inner rules are lighter than the card border, and an inactive signal reads
// as an em dash rather than a tinted pill.
const SignalRow = ({ label, value, type }) => (
  <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--color-hairline)' }}>
    <span className="font-mono text-xs" style={{ color: 'var(--color-muted)' }}>{label}</span>
    <span className="font-mono text-xs" style={{
      color: value ? (type === 'bull' ? 'var(--color-pos)' : 'var(--color-neg)') : 'var(--color-muted)',
    }}>
      {value ? 'YES' : '—'}
    </span>
  </div>
);

const ExampleCard = ({ r, onPick }) => (
  <button
    onClick={() => onPick(r.ticker)}
    className="example-card p-3 text-left"
    style={{
      border: '1px solid var(--color-divider)',
      background: 'transparent',
      fontFamily: 'inherit',
      color: 'var(--color-text)',
      cursor: 'pointer',
    }}
  >
    <div className="flex items-center justify-between mb-2">
      <span style={{ fontSize: '12.5px', letterSpacing: '0.16em' }}>{r.ticker}</span>
      <span className="font-mono text-sm">{money(r.close)}</span>
    </div>
    <div className="flex items-end justify-between gap-3">
      <Sparkline data={r.sparkline} width={110} height={30} />
      <WindowChange data={r.sparkline} />
    </div>
  </button>
);

export default function Dashboard() {
  const [ticker, setTicker] = useState('');
  const [quote, setQuote] = useState(null);
  const [signals, setSignals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const waking = useColdStartHint(loading);
  const [recent, addRecent] = useRecentTickers();
  const [live, setLive] = useState(() => nyseOpen());

  // Example cards for the empty state. null = not loaded, [] = gave up.
  const [examples, setExamples] = useState(null);
  const [examplesLoading, setExamplesLoading] = useState(true);
  const examplesWaking = useColdStartHint(examplesLoading);

  useEffect(() => {
    let live = true;
    fetch(`${API}/scan?tickers=${EXAMPLES.join(',')}`)
      .then(r => (r.ok ? r.json() : { results: [] }))
      .then(d => { if (live) setExamples(d.results || []); })
      .catch(() => { if (live) setExamples([]); })
      .finally(() => { if (live) setExamplesLoading(false); });
    return () => { live = false; };
  }, []);

  // A shared or palette link carries the symbol: search it on mount.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('ticker');
    if (t) search(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While NYSE is open, pull a fresh quote each minute. The numbers tween
  // and flash on their own when they move; nothing else re-fetches.
  useEffect(() => {
    if (!quote?.ticker) return undefined;
    const tick = async () => {
      const open = nyseOpen();
      setLive(open);
      if (!open) return;
      try {
        const res = await fetch(`${API}/quote/${quote.ticker}`);
        if (!res.ok) return;
        const d = await res.json();
        setQuote(prev => (prev?.ticker === d.ticker ? { ticker: d.ticker, ...d.quote } : prev));
      } catch (e) {
        // Keep the last quote on screen.
      }
    };
    const id = setInterval(tick, LIVE_MS);
    return () => clearInterval(id);
  }, [quote?.ticker]);

  // A non-ok response means the backend IS up but a request failed. 404
  // (unknown ticker) and 503 (upstream rate limit) carry a human-readable
  // detail from the backend; anything else gets the generic hint.
  const friendlyError = async (res) => {
    let detail = null;
    try { detail = (await res.json()).detail; } catch {}
    if ((res.status === 404 || res.status === 503) && detail) return detail;
    return `Backend error ${res.status}${detail ? `: ${detail}` : ''}. The market data source may be flaky - try again.`;
  };

  // Called with a symbol from the example cards / recents, or with the click
  // event from the search button, in which case the input's value is used.
  const search = async (arg) => {
    const sym = (typeof arg === 'string' ? arg : ticker).trim().toUpperCase();
    if (!sym) return;
    setTicker(sym);
    setLoading(true);
    setError(null);
    const params = new URLSearchParams(window.location.search);
    params.set('view', 'dashboard');
    params.set('ticker', sym);
    window.history.replaceState(null, '', `?${params.toString()}`);
    try {
      const [quoteRes, signalsRes] = await Promise.all([
        fetch(`${API}/quote/${sym}`),
        fetch(`${API}/signals/${sym}`),
      ]);
      if (!quoteRes.ok) {
        setError(await friendlyError(quoteRes));
        setQuote(null);
        setSignals(null);
      } else {
        const quoteData = await quoteRes.json();
        setQuote({ ticker: quoteData.ticker, ...quoteData.quote });
        addRecent(quoteData.ticker);
        if (signalsRes.ok) {
          const signalsData = await signalsRes.json();
          // Only store a payload the signals panel can actually render.
          setSignals(signalsData.signals ? signalsData : null);
        } else {
          // Quote is fine but signals aren't (e.g. a newly listed ticker
          // without enough history): keep the quote, explain the gap.
          setSignals(null);
          setError(await friendlyError(signalsRes));
        }
      }
    } catch (e) {
      setError('Failed to fetch data. Is your backend running?');
    }
    setLoading(false);
  };

  const isUp = quote?.change >= 0;
  const dirColor = isUp ? 'var(--color-pos)' : 'var(--color-neg)';

  return (
    <div className="max-w-4xl mx-auto">

      {/* Search */}
      <div className="flex gap-3 mb-8">
        <input
          value={ticker}
          onChange={e => setTicker(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Enter ticker: AAPL, NVDA..."
          data-search
          className="flex-1 px-4 py-3 font-mono text-sm outline-none"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-divider)', color: 'var(--color-text)' }}
        />
        <button
          onClick={search}
          className="px-6 py-3 font-mono text-sm"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
          {loading ? 'LOADING...' : 'SEARCH'}
        </button>
      </div>

      {waking && loading && (
        <p className="font-mono text-sm mb-6" style={{ color: 'var(--color-accent)' }}>
          Waking up the backend. The first request after idle can take ~30s.
        </p>
      )}
      {error && <p className="font-mono text-sm mb-6" style={{ color: 'var(--color-neg)' }}>{error}</p>}

      {loading && <QuoteSkeleton />}

      {/* Empty state: recents and a few live example tickers to tap. */}
      {!quote && !loading && (
        <div className="fade-up">
          {recent.length > 0 && (
            <div className="mb-6">
              <p className="mb-2" style={LABEL}>RECENT</p>
              <div className="flex flex-wrap gap-2">
                {recent.map(t => (
                  <button key={t} className="chip" onClick={() => search(t)}>{t}</button>
                ))}
              </div>
            </div>
          )}
          {(examplesLoading || (examples && examples.length > 0)) && (
            <p className="mb-2" style={LABEL}>TRY ONE</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {examplesLoading
              ? EXAMPLES.map(t => <ExampleCardSkeleton key={t} />)
              : (examples || []).map(r => <ExampleCard key={r.ticker} r={r} onPick={search} />)}
          </div>
          {examplesWaking && examplesLoading && (
            <p className="font-mono text-xs mt-3" style={{ color: 'var(--color-accent)' }}>
              Waking up the backend. The first request after idle can take ~30s.
            </p>
          )}
        </div>
      )}

      {quote && !loading && (
        <div className="fade-up">
          {/* Price Header */}
          {/* The quote card's border carries the day's direction, so the whole
              block reads up or down before you parse the numbers. */}
          <div className="p-5 mb-4" style={{ border: `1px solid ${dirColor}` }}>
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="font-mono text-xs tracking-widest mb-1 flex items-center gap-3" style={{ color: 'var(--color-muted)' }}>
                  {quote.ticker}
                  {live && (
                    <span className="inline-flex items-center gap-2" title="Quote refreshes every minute while NYSE is open">
                      <span className="tape__dot tape__dot--live" aria-hidden="true" />LIVE
                    </span>
                  )}
                </p>
                <p className="font-mono text-4xl" style={{ color: 'var(--color-text)' }}>
                  <AnimatedNumber value={quote.price} format={money} />
                </p>
              </div>
              {signals?.sparkline?.length > 1 && (
                <div className="hidden md:block self-center">
                  <Sparkline data={signals.sparkline} width={180} height={48} />
                  <p className="text-right mt-1" style={LABEL}>30 SESSIONS</p>
                </div>
              )}
              <div className="text-right">
                <p className="font-mono text-2xl" style={{ color: dirColor }}>
                  <AnimatedNumber value={quote.change} format={signed2} />
                </p>
                <p className="font-mono text-sm" style={{ color: dirColor }}>
                  <AnimatedNumber value={quote.change_pct} format={v => `${signed2(v)}%`} />
                </p>
              </div>
            </div>
            <RangeBar
              low={quote.year_low}
              high={quote.year_high}
              dayLow={quote.day_low}
              dayHigh={quote.day_high}
              price={quote.price}
              color={dirColor}
            />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-6">
            <StatCard label="OPEN" value={quote.open} format={money} />
            <StatCard label="DAY HIGH" value={quote.day_high} format={money} />
            <StatCard label="DAY LOW" value={quote.day_low} format={money} />
            <StatCard label="VOLUME" value={quote.volume} format={compact} />
            <StatCard label="MKT CAP" value={quote.market_cap} format={v => `$${compact(v)}`} />
            <StatCard label="P/E RATIO" value={quote.pe_ratio} />
          </div>

          <PriceChart ticker={quote?.ticker} />

          {/* Signals */}
          {signals?.signals && (
            <div className="p-4" style={{ border: '1px solid var(--color-divider)' }}>
              <p className="font-mono text-xs mb-4 tracking-widest" style={{ color: 'var(--color-muted)' }}>SIGNALS</p>

              <div className="grid grid-cols-2 gap-6 mb-4">
                {/* Bullish */}
                <div>
                  <p className="font-mono text-xs mb-2 tracking-widest" style={{ color: 'var(--color-pos)' }}>BULLISH</p>
                  <SignalRow label="BULLISH TREND" value={signals.signals.bullish_trend} type="bull" />
                  <SignalRow label="PRICE > SMA20" value={signals.signals.price_above_sma20} type="bull" />
                  <SignalRow label="PRICE > SMA50" value={signals.signals.price_above_sma50} type="bull" />
                  <SignalRow label="SMA20 > SMA50" value={signals.signals.sma20_above_sma50} type="bull" />
                  <SignalRow label="MACD CROSSOVER" value={signals.signals.macd_bullish_crossover} type="bull" />
                  <SignalRow label="RSI OVERSOLD" value={signals.signals.rsi_oversold} type="bull" />
                </div>

                {/* Bearish */}
                <div style={{ borderLeft: '1px solid var(--color-divider)', paddingLeft: '24px' }}>
                  <p className="font-mono text-xs mb-2 tracking-widest" style={{ color: 'var(--color-neg)' }}>BEARISH</p>
                  <SignalRow label="BEARISH TREND" value={signals.signals.bearish_trend} type="bear" />
                  <SignalRow label="PRICE < SMA20" value={!signals.signals.price_above_sma20} type="bear" />
                  <SignalRow label="PRICE < SMA50" value={!signals.signals.price_above_sma50} type="bear" />
                  <SignalRow label="SMA20 < SMA50" value={!signals.signals.sma20_above_sma50} type="bear" />
                  <SignalRow label="MACD CROSSOVER" value={signals.signals.macd_bearish_crossover} type="bear" />
                  <SignalRow label="RSI OVERBOUGHT" value={signals.signals.rsi_overbought} type="bear" />
                </div>
              </div>

              {/* Indicator values */}
              <div className="grid grid-cols-4 gap-2 pt-4" style={{ borderTop: '1px solid var(--color-hairline)' }}>
                <StatCard label="RSI" value={signals.rsi} color={rsiColor(signals.rsi)} />
                <StatCard label="MACD" value={signals.macd} format={v => v.toFixed(4)} color={macdColor(signals.macd_histogram)} />
                <StatCard label="SMA 20" value={signals.sma_20} />
                <StatCard label="SMA 50" value={signals.sma_50} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
