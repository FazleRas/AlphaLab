import { useState } from 'react';
import PriceChart from './PriceChart';
import useColdStartHint from '../hooks/useColdStartHint';
import API from '../config';

const StatCard = ({ label, value, color }) => (
  <div className="p-3" style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-divider)' }}>
    <p className="font-mono text-xs mb-1 tracking-widest" style={{ color: 'var(--color-muted)' }}>{label}</p>
    <p className="font-mono text-sm" style={{ color: color || 'var(--color-text)' }}>{value ?? '-'}</p>
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

export default function Dashboard() {
  const [ticker, setTicker] = useState('');
  const [quote, setQuote] = useState(null);
  const [signals, setSignals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const waking = useColdStartHint(loading);

  // A non-ok response means the backend IS up but a request failed. 404
  // (unknown ticker) and 503 (upstream rate limit) carry a human-readable
  // detail from the backend; anything else gets the generic hint.
  const friendlyError = async (res) => {
    let detail = null;
    try { detail = (await res.json()).detail; } catch {}
    if ((res.status === 404 || res.status === 503) && detail) return detail;
    return `Backend error ${res.status}${detail ? `: ${detail}` : ''}. The market data source may be flaky - try again.`;
  };

  const search = async () => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    try {
      const [quoteRes, signalsRes] = await Promise.all([
        fetch(`${API}/quote/${ticker}`),
        fetch(`${API}/signals/${ticker}`),
      ]);
      if (!quoteRes.ok) {
        setError(await friendlyError(quoteRes));
        setQuote(null);
        setSignals(null);
      } else {
        const quoteData = await quoteRes.json();
        setQuote({ ticker: quoteData.ticker, ...quoteData.quote });
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

  return (
    <div className="max-w-4xl mx-auto">

      {/* Search */}
      <div className="flex gap-3 mb-8">
        <input
          value={ticker}
          onChange={e => setTicker(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Enter ticker: AAPL, NVDA..."
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

      {quote && (
        <>
          {/* Price Header */}
          {/* The quote card's border carries the day's direction, so the whole
              block reads up or down before you parse the numbers. */}
          <div className="p-5 mb-4" style={{ border: `1px solid ${isUp ? 'var(--color-pos)' : 'var(--color-neg)'}` }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>{quote.ticker}</p>
                <p className="font-mono text-4xl" style={{ color: 'var(--color-text)' }}>${quote.price}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-2xl" style={{ color: isUp ? 'var(--color-pos)' : 'var(--color-neg)' }}>
                  {isUp ? '+' : ''}{quote.change}
                </p>
                <p className="font-mono text-sm" style={{ color: isUp ? 'var(--color-pos)' : 'var(--color-neg)' }}>
                  {isUp ? '+' : ''}{quote.change_pct}%
                </p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
            <StatCard label="OPEN" value={`$${quote.open}`} />
            <StatCard label="DAY HIGH" value={`$${quote.day_high}`} />
            <StatCard label="DAY LOW" value={`$${quote.day_low}`} />
            <StatCard label="P/E RATIO" value={quote.pe_ratio?.toFixed(2)} />
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
                <StatCard label="MACD" value={signals.macd} color={macdColor(signals.macd_histogram)} />
                <StatCard label="SMA 20" value={signals.sma_20} />
                <StatCard label="SMA 50" value={signals.sma_50} />
            </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}