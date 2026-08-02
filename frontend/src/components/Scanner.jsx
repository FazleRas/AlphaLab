import { useState } from 'react';
import useColdStartHint from '../hooks/useColdStartHint';
import API from '../config';

const signals = [
  { key: 'bullish_trend', label: 'BULLISH TREND' },
  { key: 'bearish_trend', label: 'BEARISH TREND' },
  { key: 'rsi_oversold', label: 'RSI OVERSOLD' },
  { key: 'rsi_overbought', label: 'RSI OVERBOUGHT' },
  { key: 'macd_bullish_crossover', label: 'MACD BULLISH CROSSOVER' },
  { key: 'macd_bearish_crossover', label: 'MACD BEARISH CROSSOVER' },
];

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

export default function Scanner() {
  const [tickers, setTickers] = useState('');
  const [filters, setFilters] = useState({});
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const waking = useColdStartHint(loading);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const toggleFilter = (key) => {
    setFilters(prev => ({
      ...prev,
      [key]: prev[key] ? undefined : true
    }));
  };

  const scan = async () => {
    if (!tickers) return;
    setLoading(true);
    setError(null);
    try {
      const activeFilters = Object.entries(filters)
        .filter(([, v]) => v)
        .map(([k]) => `${k}=true`)
        .join('&');
      const url = `${API}/scan?tickers=${tickers}${activeFilters ? '&' + activeFilters : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      setResults(data.results);
    } catch (e) {
      setError('Failed to scan. Is your backend running?');
    }
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto">

      {/* Input */}
      <div className="flex gap-3 mb-6">
        <input
          value={tickers}
          onChange={e => setTickers(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && scan()}
          placeholder="AAPL,NVDA,TSLA,MSFT,AMD..."
          className="flex-1 px-4 py-3 font-mono text-sm outline-none"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-divider)', color: 'var(--color-text)' }}
        />
        <button
        onClick={(e) => {
            e.preventDefault();
            scan();
        }}
        className="px-6 py-3 font-mono text-sm"
        style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
        {loading ? 'SCANNING...' : 'SCAN'}
        </button>
      </div>

      {/* Filters */}
      <div className="p-4 mb-6" style={{ border: '1px solid var(--color-divider)' }}>
        <p className="font-mono text-xs mb-3 tracking-widest" style={{ color: 'var(--color-muted)' }}>FILTERS</p>
        <div className="flex flex-wrap gap-2">
          {signals.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleFilter(key)}
              className={`chip${filters[key] ? ' chip--on' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {waking && loading && (
        <p className="font-mono text-sm mb-4" style={{ color: 'var(--color-accent)' }}>
          Waking up the backend — the first request after idle can take ~30s.
        </p>
      )}
      {error && <p className="font-mono text-sm mb-4" style={{ color: 'var(--color-neg)' }}>{error}</p>}

      {/* Results */}
      {results && (
        <div>
          {/* Count bar: results and how many filters produced them. */}
          <div className="p-4 mb-4" style={{ border: '1px solid var(--color-divider)' }}>
            <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-muted)' }}>
              {results.length} RESULT{results.length !== 1 ? 'S' : ''} - {activeFilterCount} FILTER{activeFilterCount !== 1 ? 'S' : ''} ACTIVE
            </p>
          </div>
          {results.length === 0 && (
            <p className="font-mono text-sm" style={{ color: 'var(--color-muted)' }}>No tickers matched your filters.</p>
          )}
          {results.map(r => (
            <div key={r.ticker} className="p-4 mb-3" style={{ border: '1px solid var(--color-divider)' }}>
                
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-lg" style={{ color: 'var(--color-text)' }}>{r.ticker}</span>
                <div className="text-right">
                    <span className="font-mono text-lg" style={{ color: 'var(--color-accent)' }}>${r.close}</span>
                </div>
                </div>

                {/* Signals split into two columns */}
                <div className="grid grid-cols-2 gap-4 mb-4" style={{ borderTop: '1px solid var(--color-hairline)', paddingTop: '12px' }}>
                
                {/* Bullish */}
                <div>
                    <p className="font-mono text-xs mb-2 tracking-widest" style={{ color: 'var(--color-pos)' }}>BULLISH</p>
                    {[
                    ['BULLISH TREND', r.signals.bullish_trend],
                    ['PRICE > SMA20', r.signals.price_above_sma20],
                    ['PRICE > SMA50', r.signals.price_above_sma50],
                    ['SMA20 > SMA50', r.signals.sma20_above_sma50],
                    ['MACD CROSSOVER', r.signals.macd_bullish_crossover],
                    ['RSI OVERSOLD', r.signals.rsi_oversold],
                    ].map(([label, val]) => (
                    <div key={label} className="flex items-center justify-between py-1" style={{ borderBottom: '1px solid var(--color-hairline)' }}>
                        <span className="font-mono text-xs" style={{ color: 'var(--color-muted)' }}>{label}</span>
                        <span className="font-mono text-xs" style={{
                        color: val ? 'var(--color-pos)' : 'var(--color-muted)',
                        }}>{val ? 'YES' : '—'}</span>
                    </div>
                    ))}
                </div>

                {/* Divider */}
                <div style={{ borderLeft: '1px solid var(--color-divider)', paddingLeft: '16px' }}>
                    <p className="font-mono text-xs mb-2 tracking-widest" style={{ color: 'var(--color-neg)' }}>BEARISH</p>
                    {[
                    ['BEARISH TREND', r.signals.bearish_trend],
                    ['PRICE < SMA20', !r.signals.price_above_sma20],
                    ['PRICE < SMA50', !r.signals.price_above_sma50],
                    ['SMA20 < SMA50', !r.signals.sma20_above_sma50],
                    ['MACD CROSSOVER', r.signals.macd_bearish_crossover],
                    ['RSI OVERBOUGHT', r.signals.rsi_overbought],
                    ].map(([label, val]) => (
                    <div key={label} className="flex items-center justify-between py-1" style={{ borderBottom: '1px solid var(--color-hairline)' }}>
                        <span className="font-mono text-xs" style={{ color: 'var(--color-muted)' }}>{label}</span>
                        <span className="font-mono text-xs" style={{
                        color: val ? 'var(--color-neg)' : 'var(--color-muted)',
                        }}>{val ? 'YES' : '—'}</span>
                    </div>
                    ))}
                </div>
                </div>

                {/* Stats row */}
                <div className="flex gap-6 pt-2" style={{ borderTop: '1px solid var(--color-hairline)' }}>
                <span className="font-mono text-xs" style={{ color: 'var(--color-muted)' }}>RSI <span style={{ color: rsiColor(r.rsi) }}>{r.rsi}</span></span>
                <span className="font-mono text-xs" style={{ color: 'var(--color-muted)' }}>MACD <span style={{ color: macdColor(r.macd_histogram) }}>{r.macd}</span></span>
                <span className="font-mono text-xs" style={{ color: 'var(--color-muted)' }}>SMA20 <span style={{ color: 'var(--color-text)' }}>{r.sma_20}</span></span>
                <span className="font-mono text-xs" style={{ color: 'var(--color-muted)' }}>SMA50 <span style={{ color: 'var(--color-text)' }}>{r.sma_50}</span></span>
                </div>

            </div>
            ))}
        </div>
      )}
    </div>
  );
}