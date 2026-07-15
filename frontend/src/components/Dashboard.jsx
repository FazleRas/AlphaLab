import { useState } from 'react';
import PriceChart from './PriceChart';
import useColdStartHint from '../hooks/useColdStartHint';
import API from '../config';

const StatCard = ({ label, value, color }) => (
  <div className="p-3 rounded" style={{ backgroundColor: '#0a0a0f', border: '1px solid #1e1e2e' }}>
    <p className="font-mono text-xs mb-1 tracking-widest" style={{ color: '#6b7280' }}>{label}</p>
    <p className="font-mono text-sm" style={{ color: color || '#e2e2e2' }}>{value ?? '-'}</p>
  </div>
);

const rsiColor = (rsi) => {
  if (!rsi) return '#e2e2e2';
  if (rsi > 70) return '#ff4d6d';
  if (rsi < 30) return '#00c896';
  if (rsi > 60) return '#f97316';
  return '#e2e2e2';
};

const macdColor = (histogram) => {
  if (!histogram) return '#e2e2e2';
  return histogram > 0 ? '#00c896' : '#ff4d6d';
};

const SignalRow = ({ label, value, type }) => (
  <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #1e1e2e' }}>
    <span className="font-mono text-xs" style={{ color: '#6b7280' }}>{label}</span>
    <span className="font-mono text-xs px-2 py-0.5 rounded" style={{
      backgroundColor: value ? (type === 'bull' ? '#00c89620' : '#ff4d6d20') : 'transparent',
      color: value ? (type === 'bull' ? '#00c896' : '#ff4d6d') : '#6b7280',
    }}>
      {value ? 'YES' : '-'}
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

  const search = async () => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    try {
      const [quoteRes, signalsRes] = await Promise.all([
        fetch(`${API}/quote/${ticker}`),
        fetch(`${API}/signals/${ticker}`),
      ]);
      // A non-ok response means the backend IS up but a request failed
      // (usually the upstream market-data source). Show the real error
      // instead of the generic "is your backend running?" guess.
      const bad = !quoteRes.ok ? quoteRes : !signalsRes.ok ? signalsRes : null;
      if (bad) {
        let detail = null;
        try { detail = (await bad.json()).detail; } catch {}
        setError(`Backend error ${bad.status}${detail ? `: ${detail}` : ''}. The market data source may be flaky - try again.`);
        setQuote(null);
        setSignals(null);
      } else {
        const quoteData = await quoteRes.json();
        const signalsData = await signalsRes.json();
        setQuote({ ticker: quoteData.ticker, ...quoteData.quote });
        setSignals(signalsData);
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
          className="flex-1 px-4 py-3 font-mono text-sm rounded outline-none"
          style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e', color: '#e2e2e2' }}
        />
        <button
          onClick={search}
          className="px-6 py-3 font-mono text-sm rounded"
          style={{ backgroundColor: '#2563eb', color: '#fff' }}
        >
          {loading ? 'LOADING...' : 'SEARCH'}
        </button>
      </div>

      {waking && loading && (
        <p className="font-mono text-sm mb-6" style={{ color: '#f97316' }}>
          Waking up the backend. The first request after idle can take ~30s.
        </p>
      )}
      {error && <p className="font-mono text-sm mb-6" style={{ color: '#ff4d6d' }}>{error}</p>}

      {quote && (
        <>
          {/* Price Header */}
          <div className="p-5 rounded mb-4" style={{ 
            backgroundColor: '#111118', 
            border: `1px solid ${isUp ? '#00c89640' : '#ff4d6d40'}` 
          }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs tracking-widest mb-1" style={{ color: '#6b7280' }}>{quote.ticker}</p>
                <p className="font-mono text-4xl" style={{ color: '#e2e2e2' }}>${quote.price}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-2xl" style={{ color: isUp ? '#00c896' : '#ff4d6d' }}>
                  {isUp ? '+' : ''}{quote.change}
                </p>
                <p className="font-mono text-sm" style={{ color: isUp ? '#00c896' : '#ff4d6d' }}>
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
          {signals && (
            <div className="rounded p-4" style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e' }}>
              <p className="font-mono text-xs mb-4 tracking-widest" style={{ color: '#6b7280' }}>SIGNALS</p>
              
              <div className="grid grid-cols-2 gap-6 mb-4">
                {/* Bullish */}
                <div>
                  <p className="font-mono text-xs mb-2 tracking-widest" style={{ color: '#00c896' }}>BULLISH</p>
                  <SignalRow label="BULLISH TREND" value={signals.signals.bullish_trend} type="bull" />
                  <SignalRow label="PRICE > SMA20" value={signals.signals.price_above_sma20} type="bull" />
                  <SignalRow label="PRICE > SMA50" value={signals.signals.price_above_sma50} type="bull" />
                  <SignalRow label="SMA20 > SMA50" value={signals.signals.sma20_above_sma50} type="bull" />
                  <SignalRow label="MACD CROSSOVER" value={signals.signals.macd_bullish_crossover} type="bull" />
                  <SignalRow label="RSI OVERSOLD" value={signals.signals.rsi_oversold} type="bull" />
                </div>

                {/* Bearish */}
                <div style={{ borderLeft: '1px solid #1e1e2e', paddingLeft: '24px' }}>
                  <p className="font-mono text-xs mb-2 tracking-widest" style={{ color: '#ff4d6d' }}>BEARISH</p>
                  <SignalRow label="BEARISH TREND" value={signals.signals.bearish_trend} type="bear" />
                  <SignalRow label="PRICE < SMA20" value={!signals.signals.price_above_sma20} type="bear" />
                  <SignalRow label="PRICE < SMA50" value={!signals.signals.price_above_sma50} type="bear" />
                  <SignalRow label="SMA20 < SMA50" value={!signals.signals.sma20_above_sma50} type="bear" />
                  <SignalRow label="MACD CROSSOVER" value={signals.signals.macd_bearish_crossover} type="bear" />
                  <SignalRow label="RSI OVERBOUGHT" value={signals.signals.rsi_overbought} type="bear" />
                </div>
              </div>

              {/* Indicator values */}
              <div className="grid grid-cols-4 gap-2 pt-4" style={{ borderTop: '1px solid #1e1e2e' }}>
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