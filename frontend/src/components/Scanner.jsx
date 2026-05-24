import { useState } from 'react';

const API = 'http://127.0.0.1:8000';

const signals = [
  { key: 'bullish_trend', label: 'BULLISH TREND' },
  { key: 'bearish_trend', label: 'BEARISH TREND' },
  { key: 'rsi_oversold', label: 'RSI OVERSOLD' },
  { key: 'rsi_overbought', label: 'RSI OVERBOUGHT' },
  { key: 'macd_bullish_crossover', label: 'MACD BULLISH CROSSOVER' },
  { key: 'macd_bearish_crossover', label: 'MACD BEARISH CROSSOVER' },
];

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

const SignalBadge = ({ value }) => (
  <span className="font-mono text-xs px-2 py-1 rounded"
    style={{
      backgroundColor: value ? '#00c89620' : '#ff4d6d20',
      color: value ? '#00c896' : '#ff4d6d',
    }}>
    {value ? 'YES' : 'NO'}
  </span>
);

export default function Scanner() {
  const [tickers, setTickers] = useState('');
  const [filters, setFilters] = useState({});
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
      console.log('results received:', data.results.length, data.results.map(r => r.ticker));
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
          className="flex-1 px-4 py-3 font-mono text-sm rounded outline-none"
          style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e', color: '#e2e2e2' }}
        />
        <button
        onClick={(e) => {
            e.preventDefault();
            scan();
        }}
        className="px-6 py-3 font-mono text-sm rounded"
        style={{ backgroundColor: '#2563eb', color: '#fff' }}
        >
        {loading ? 'SCANNING...' : 'SCAN'}
        </button>
      </div>

      {/* Filters */}
      <div className="p-4 rounded mb-6" style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e' }}>
        <p className="font-mono text-xs mb-3 tracking-widest" style={{ color: '#6b7280' }}>FILTERS</p>
        <div className="flex flex-wrap gap-2">
          {signals.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleFilter(key)}
              className="px-3 py-1 font-mono text-xs rounded transition-all"
              style={{
                backgroundColor: filters[key] ? '#2563eb20' : '#1e1e2e',
                border: `1px solid ${filters[key] ? '#2563eb' : '#1e1e2e'}`,
                color: filters[key] ? '#2563eb' : '#6b7280',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="font-mono text-sm mb-4" style={{ color: '#ff4d6d' }}>{error}</p>}

      {/* Results */}
      {results && (
        <div>
          <p className="font-mono text-xs mb-4 tracking-widest" style={{ color: '#6b7280' }}>
            {results.length} RESULT{results.length !== 1 ? 'S' : ''}
          </p>
          {results.length === 0 && (
            <p className="font-mono text-sm" style={{ color: '#6b7280' }}>No tickers matched your filters.</p>
          )}
          {results.map(r => (
            <div key={r.ticker} className="p-4 rounded mb-3" style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e' }}>
                
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-lg" style={{ color: '#e2e2e2' }}>{r.ticker}</span>
                <div className="text-right">
                    <span className="font-mono text-lg" style={{ color: '#2563eb' }}>${r.close}</span>
                </div>
                </div>

                {/* Signals split into two columns */}
                <div className="grid grid-cols-2 gap-4 mb-4" style={{ borderTop: '1px solid #1e1e2e', paddingTop: '12px' }}>
                
                {/* Bullish */}
                <div>
                    <p className="font-mono text-xs mb-2 tracking-widest" style={{ color: '#00c896' }}>BULLISH</p>
                    {[
                    ['BULLISH TREND', r.signals.bullish_trend],
                    ['PRICE > SMA20', r.signals.price_above_sma20],
                    ['PRICE > SMA50', r.signals.price_above_sma50],
                    ['SMA20 > SMA50', r.signals.sma20_above_sma50],
                    ['MACD CROSSOVER', r.signals.macd_bullish_crossover],
                    ['RSI OVERSOLD', r.signals.rsi_oversold],
                    ].map(([label, val]) => (
                    <div key={label} className="flex items-center justify-between py-1" style={{ borderBottom: '1px solid #1e1e2e' }}>
                        <span className="font-mono text-xs" style={{ color: '#6b7280' }}>{label}</span>
                        <span className="font-mono text-xs px-2 py-0.5 rounded" style={{
                        backgroundColor: val ? '#00c89620' : 'transparent',
                        color: val ? '#00c896' : '#6b7280',
                        }}>{val ? 'YES' : '—'}</span>
                    </div>
                    ))}
                </div>

                {/* Divider */}
                <div style={{ borderLeft: '1px solid #1e1e2e', paddingLeft: '16px' }}>
                    <p className="font-mono text-xs mb-2 tracking-widest" style={{ color: '#ff4d6d' }}>BEARISH</p>
                    {[
                    ['BEARISH TREND', r.signals.bearish_trend],
                    ['PRICE < SMA20', !r.signals.price_above_sma20],
                    ['PRICE < SMA50', !r.signals.price_above_sma50],
                    ['SMA20 < SMA50', !r.signals.sma20_above_sma50],
                    ['MACD CROSSOVER', r.signals.macd_bearish_crossover],
                    ['RSI OVERBOUGHT', r.signals.rsi_overbought],
                    ].map(([label, val]) => (
                    <div key={label} className="flex items-center justify-between py-1" style={{ borderBottom: '1px solid #1e1e2e' }}>
                        <span className="font-mono text-xs" style={{ color: '#6b7280' }}>{label}</span>
                        <span className="font-mono text-xs px-2 py-0.5 rounded" style={{
                        backgroundColor: val ? '#ff4d6d20' : 'transparent',
                        color: val ? '#ff4d6d' : '#6b7280',
                        }}>{val ? 'YES' : '—'}</span>
                    </div>
                    ))}
                </div>
                </div>

                {/* Stats row */}
                <div className="flex gap-6 pt-2" style={{ borderTop: '1px solid #1e1e2e' }}>
                <span className="font-mono text-xs" style={{ color: '#6b7280' }}>RSI <span style={{ color: rsiColor(r.rsi) }}>{r.rsi}</span></span>
                <span className="font-mono text-xs" style={{ color: '#6b7280' }}>MACD <span style={{ color: macdColor(r.macd_histogram) }}>{r.macd}</span></span>
                <span className="font-mono text-xs" style={{ color: '#6b7280' }}>SMA20 <span style={{ color: '#e2e2e2' }}>{r.sma_20}</span></span>
                <span className="font-mono text-xs" style={{ color: '#6b7280' }}>SMA50 <span style={{ color: '#e2e2e2' }}>{r.sma_50}</span></span>
                </div>

            </div>
            ))}
        </div>
      )}
    </div>
  );
}