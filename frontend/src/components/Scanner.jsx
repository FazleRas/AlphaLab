import { useState, useEffect } from 'react';
import Sparkline, { windowPct } from './Sparkline';
import { Skeleton } from './Skeleton';
import useColdStartHint from '../hooks/useColdStartHint';
import { goTo } from '../nav';
import API from '../config';

const signals = [
  { key: 'bullish_trend', label: 'BULLISH TREND' },
  { key: 'bearish_trend', label: 'BEARISH TREND' },
  { key: 'rsi_oversold', label: 'RSI OVERSOLD' },
  { key: 'rsi_overbought', label: 'RSI OVERBOUGHT' },
  { key: 'macd_bullish_crossover', label: 'MACD BULLISH CROSSOVER' },
  { key: 'macd_bearish_crossover', label: 'MACD BEARISH CROSSOVER' },
];

// One-tap ticker sets for the empty state.
const PRESETS = [
  { label: 'MEGA CAP', tickers: 'AAPL,MSFT,GOOGL,AMZN,META,NVDA' },
  { label: 'SEMIS', tickers: 'NVDA,AMD,AVGO,TSM,INTC,MU,QCOM' },
  { label: 'EV & AUTO', tickers: 'TSLA,RIVN,F,GM,TM' },
  { label: 'ETFS', tickers: 'SPY,QQQ,IWM,DIA,XLF,XLE' },
];

const LABEL = { fontSize: '10.5px', letterSpacing: '0.16em', color: 'var(--color-muted)' };

const rsiColor = (rsi) => {
  if (rsi == null) return 'var(--color-muted)';
  if (rsi > 70) return 'var(--color-neg)';
  if (rsi < 30) return 'var(--color-pos)';
  return 'var(--color-text)';
};

// Heat behind the RSI value: nothing in the neutral band, deepening toward
// either extreme.
const rsiHeat = (rsi) => {
  if (rsi == null) return 'transparent';
  const t = rsi > 70 ? (rsi - 70) / 30 : rsi < 30 ? (30 - rsi) / 30 : 0;
  if (t === 0) return 'transparent';
  return `color-mix(in oklch, ${rsi > 70 ? 'var(--color-neg)' : 'var(--color-pos)'} ${Math.round(t * 55)}%, transparent)`;
};

const trendOf = (r) => (r.signals.bullish_trend ? 1 : r.signals.bearish_trend ? -1 : 0);
const posNeg = (v) => (v == null ? 'var(--color-muted)' : v > 0 ? 'var(--color-pos)' : v < 0 ? 'var(--color-neg)' : 'var(--color-text)');
const fix = (v, d = 2) => (v == null ? '—' : Number(v).toFixed(d));

// Five squares per row: each reads bullish (green), bearish (red) or neither.
const flags = (s) => [
  { title: 'PRICE vs SMA20', v: s.price_above_sma20 ? 1 : -1 },
  { title: 'PRICE vs SMA50', v: s.price_above_sma50 ? 1 : -1 },
  { title: 'SMA20 vs SMA50', v: s.sma20_above_sma50 ? 1 : -1 },
  { title: 'MACD crossover', v: s.macd_bullish_crossover ? 1 : s.macd_bearish_crossover ? -1 : 0 },
  { title: 'RSI extreme', v: s.rsi_oversold ? 1 : s.rsi_overbought ? -1 : 0 },
];

const COLS = [
  { key: 'ticker', label: 'TICKER', left: true, sort: r => r.ticker },
  { key: 'spark', label: '30D', left: true },
  { key: 'close', label: 'LAST', sort: r => r.close },
  { key: 'm1', label: '1M', sort: r => windowPct(r.sparkline) ?? -Infinity },
  { key: 'rsi', label: 'RSI', sort: r => r.rsi ?? -Infinity },
  { key: 'macd_histogram', label: 'MACD H', sort: r => r.macd_histogram ?? -Infinity },
  { key: 'trend', label: 'TREND', sort: trendOf },
  { key: 'flags', label: 'SIGNALS', left: true },
  { key: 'sma_20', label: 'SMA20', sort: r => r.sma_20 ?? -Infinity },
  { key: 'sma_50', label: 'SMA50', sort: r => r.sma_50 ?? -Infinity },
];

const Cell = ({ left, children, style, className = 'py-2 px-3' }) => (
  <td className={className} style={{ textAlign: left ? 'left' : 'right', whiteSpace: 'nowrap', ...style }}>{children}</td>
);

const SkeletonRows = ({ n = 5 }) => (
  <tbody aria-hidden="true">
    {Array.from({ length: n }, (_, i) => (
      <tr key={i} style={{ borderTop: '1px solid var(--color-hairline)' }}>
        {COLS.map(c => (
          <td key={c.key} className="py-2 px-3">
            <Skeleton w={c.key === 'spark' ? 90 : c.key === 'flags' ? 52 : 40} h={c.key === 'spark' ? 20 : 10} style={{ marginLeft: c.left ? 0 : 'auto' }} />
          </td>
        ))}
      </tr>
    ))}
  </tbody>
);

export default function Scanner() {
  const [tickers, setTickers] = useState('');
  const [filters, setFilters] = useState({});
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState({ key: 'm1', dir: -1 });
  const waking = useColdStartHint(loading);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const toggleFilter = (key) => {
    setFilters(prev => ({ ...prev, [key]: prev[key] ? undefined : true }));
  };

  const scan = async (arg) => {
    const list = (typeof arg === 'string' ? arg : tickers).replace(/\s+/g, '');
    if (!list) return;
    if (list !== tickers) setTickers(list);
    setLoading(true);
    setError(null);
    const params = new URLSearchParams(window.location.search);
    params.set('view', 'scanner');
    params.set('tickers', list);
    window.history.replaceState(null, '', `?${params.toString()}`);
    try {
      const activeFilters = Object.entries(filters)
        .filter(([, v]) => v)
        .map(([k]) => `${k}=true`)
        .join('&');
      const url = `${API}/scan?tickers=${list}${activeFilters ? '&' + activeFilters : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      setResults(data.results || []);
    } catch (e) {
      setError('Failed to scan. Is your backend running?');
    }
    setLoading(false);
  };

  // A shared or palette link carries the list: scan it on mount.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tickers');
    if (t) scan(t.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortBy = (col) => {
    if (!col.sort) return;
    setSort(prev => (prev.key === col.key ? { key: col.key, dir: -prev.dir } : { key: col.key, dir: col.key === 'ticker' ? 1 : -1 }));
  };

  const sorted = (() => {
    if (!results) return [];
    const col = COLS.find(c => c.key === sort.key);
    if (!col?.sort) return results;
    return [...results].sort((a, b) => {
      const x = col.sort(a); const y = col.sort(b);
      if (typeof x === 'string') return x.localeCompare(y) * sort.dir;
      return (x - y) * sort.dir;
    });
  })();

  return (
    <div className="max-w-4xl mx-auto">

      {/* Input */}
      <div className="flex gap-3 mb-6">
        <input
          value={tickers}
          onChange={e => setTickers(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && scan()}
          placeholder="AAPL,NVDA,TSLA,MSFT,AMD..."
          data-search
          className="flex-1 px-4 py-3 font-mono text-sm outline-none"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-divider)', color: 'var(--color-text)' }}
        />
        <button
          onClick={() => scan()}
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
            <button key={key} onClick={() => toggleFilter(key)} className={`chip${filters[key] ? ' chip--on' : ''}`}>
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

      {/* Empty state: preset lists to scan with one tap. */}
      {!results && !loading && (
        <div className="p-4 mb-6 fade-up" style={{ border: '1px solid var(--color-divider)' }}>
          <p className="font-mono text-xs mb-3 tracking-widest" style={{ color: 'var(--color-muted)' }}>PRESETS</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button key={p.label} className="chip" onClick={() => scan(p.tickers)} aria-label={`${p.label}: ${p.tickers}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results: one row per ticker, sortable, click through to the dashboard. */}
      {(loading || results) && (
        <div className={`p-4 ${loading ? '' : 'fade-up'}`} style={{ border: '1px solid var(--color-divider)' }}>
          <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
            <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-muted)' }}>
              {loading
                ? 'SCANNING'
                : `${results.length} RESULT${results.length !== 1 ? 'S' : ''} · ${activeFilterCount} FILTER${activeFilterCount !== 1 ? 'S' : ''} ACTIVE`}
            </p>
            <p style={LABEL}>CLICK A ROW TO OPEN IT · CLICK A HEADER TO SORT</p>
          </div>
          <div className="overflow-x-auto">
            <table className="scan-table w-full font-mono text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--color-muted)' }}>
                  {COLS.map(c => (
                    <th
                      key={c.key}
                      className="py-2 px-3"
                      style={{ textAlign: c.left ? 'left' : 'right', cursor: c.sort ? 'pointer' : 'default' }}
                      onClick={() => sortBy(c)}
                      aria-sort={sort.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}
                    >
                      {c.label}{sort.key === c.key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              {loading ? <SkeletonRows /> : (
                <tbody>
                  {sorted.length === 0 && (
                    <tr style={{ borderTop: '1px solid var(--color-hairline)' }}>
                      <td colSpan={COLS.length} className="py-3 px-3" style={{ color: 'var(--color-muted)' }}>No tickers matched your filters.</td>
                    </tr>
                  )}
                  {sorted.map(r => {
                    const m1 = windowPct(r.sparkline);
                    const trend = trendOf(r);
                    return (
                      <tr
                        key={r.ticker}
                        style={{ borderTop: '1px solid var(--color-hairline)' }}
                        onClick={() => goTo('dashboard', { ticker: r.ticker })}
                        title={`Open ${r.ticker} on the dashboard`}
                      >
                        <Cell left style={{ color: 'var(--color-text)', fontSize: '12.5px' }}>{r.ticker}</Cell>
                        <Cell left className="py-1 px-3"><Sparkline data={r.sparkline} width={90} height={22} animate={false} /></Cell>
                        <Cell style={{ color: 'var(--color-text)' }}>${fix(r.close)}</Cell>
                        <Cell style={{ color: posNeg(m1) }}>{m1 == null ? '—' : `${m1 >= 0 ? '+' : ''}${m1.toFixed(1)}%`}</Cell>
                        <Cell style={{ color: rsiColor(r.rsi), background: rsiHeat(r.rsi) }}>{fix(r.rsi, 1)}</Cell>
                        <Cell style={{ color: posNeg(r.macd_histogram) }}>{fix(r.macd_histogram, 3)}</Cell>
                        <Cell style={{ color: trend > 0 ? 'var(--color-pos)' : trend < 0 ? 'var(--color-neg)' : 'var(--color-muted)' }}>
                          {trend > 0 ? 'BULL' : trend < 0 ? 'BEAR' : '—'}
                        </Cell>
                        <Cell left>
                          {flags(r.signals).map(f => (
                            <span key={f.title} className={`sig${f.v > 0 ? ' sig--pos' : f.v < 0 ? ' sig--neg' : ''}`} title={f.title} />
                          ))}
                        </Cell>
                        <Cell style={{ color: 'var(--color-text)' }}>{fix(r.sma_20)}</Cell>
                        <Cell style={{ color: 'var(--color-text)' }}>{fix(r.sma_50)}</Cell>
                      </tr>
                    );
                  })}
                </tbody>
              )}
            </table>
          </div>
          <p className="mt-3" style={LABEL}>
            SIGNALS · PRICE/SMA20 · PRICE/SMA50 · SMA20/SMA50 · MACD CROSS · RSI EXTREME — <span style={{ color: 'var(--color-pos)' }}>■</span> BULLISH <span style={{ color: 'var(--color-neg)' }}>■</span> BEARISH
          </p>
        </div>
      )}
    </div>
  );
}
