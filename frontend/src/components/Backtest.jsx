import { useState, useEffect } from 'react';
import EquityCurveChart from './EquityCurveChart';
import SweepHeatmap from './SweepHeatmap';
import useColdStartHint from '../hooks/useColdStartHint';
import API from '../config';

const ColdStartHint = () => (
  <p className="font-mono text-xs mb-4" style={{ color: '#f97316' }}>
    Waking up the backend — the first request after idle can take ~30s.
  </p>
);

const StatCard = ({ label, value, color }) => (
  <div className="p-3 rounded" style={{ backgroundColor: '#0a0a0f', border: '1px solid #1e1e2e' }}>
    <p className="font-mono text-xs mb-1 tracking-widest" style={{ color: '#6b7280' }}>{label}</p>
    <p className="font-mono text-sm" style={{ color: color || '#e2e2e2' }}>{value ?? '—'}</p>
  </div>
);

// Sharpe color bands: <0 red, 0–1 orange, 1–2 white, >2 green.
const sharpeColor = (s) => {
  if (s == null) return '#6b7280';
  if (s < 0) return '#ff4d6d';
  if (s < 1) return '#f97316';
  if (s < 2) return '#e2e2e2';
  return '#00c896';
};

export default function Backtest() {
  const [ticker, setTicker] = useState('');
  const [period, setPeriod] = useState('2y');
  const [buyRsi, setBuyRsi] = useState(30);
  const [sellRsi, setSellRsi] = useState(70);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [strategy, setStrategy] = useState('rsi');
  const [mode, setMode] = useState('single'); // 'single' | 'sweep'
  const [sweepData, setSweepData] = useState(null);
  const [sweepMetric, setSweepMetric] = useState('total_return_pct');
  const [copied, setCopied] = useState(false);
  const waking = useColdStartHint(loading);

  const periods = ['6mo', '1y', '2y', '5y', 'max'];
  const sweepSupported = strategy === 'rsi' || strategy === 'combined';

  // Reflect the current run in the URL so it's shareable/bookmarkable.
  const syncUrl = (params) => {
    const q = new URLSearchParams({ view: 'backtest', ...params });
    window.history.replaceState(null, '', `?${q.toString()}`);
  };

  const run = async (opts = {}) => {
    const tk = (opts.ticker ?? ticker).toUpperCase();
    const per = opts.period ?? period;
    const strat = opts.strategy ?? strategy;
    const b = opts.buyRsi ?? buyRsi;
    const s = opts.sellRsi ?? sellRsi;
    if (!tk) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/backtest/${tk}?period=${per}&strategy=${strat}&buy_rsi=${b}&sell_rsi=${s}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setResults(null);
      } else {
        setResults(data);
        syncUrl({ ticker: tk, period: per, strategy: strat, buy_rsi: b, sell_rsi: s, mode: 'single' });
      }
    } catch (e) {
      setError('Failed to run backtest. Is your backend running?');
    }
    setLoading(false);
  };

  const runSweep = async (opts = {}) => {
    const tk = (opts.ticker ?? ticker).toUpperCase();
    const per = opts.period ?? period;
    const strat = opts.strategy ?? strategy;
    if (!tk) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/sweep/${tk}?period=${per}&strategy=${strat}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setSweepData(null);
      } else {
        setSweepData(data);
        syncUrl({ ticker: tk, period: per, strategy: strat, mode: 'sweep' });
      }
    } catch (e) {
      setError('Failed to run sweep. Is your backend running?');
    }
    setLoading(false);
  };

  // Click a heatmap cell → drill into a full single backtest of that combo.
  const selectCell = (b, s) => {
    setBuyRsi(b);
    setSellRsi(s);
    setMode('single');
    run({ buyRsi: b, sellRsi: s });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // On load, restore a shared backtest from the URL and run it automatically.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const tk = p.get('ticker');
    if (!tk) return;
    const per = p.get('period') || '2y';
    const strat = p.get('strategy') || 'rsi';
    const b = p.get('buy_rsi'); const s = p.get('sell_rsi');
    const md = p.get('mode') === 'sweep' ? 'sweep' : 'single';
    setTicker(tk.toUpperCase());
    setPeriod(per);
    setStrategy(strat);
    setMode(md);
    if (b != null) setBuyRsi(b);
    if (s != null) setSellRsi(s);
    if (md === 'sweep') runSweep({ ticker: tk, period: per, strategy: strat });
    else run({ ticker: tk, period: per, strategy: strat, buyRsi: b ?? 30, sellRsi: s ?? 70 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickStrategy = (key) => {
    setStrategy(key);
    if (key !== 'rsi' && key !== 'combined') setMode('single');
  };

  // Export the trade history to a CSV the user can open in Excel/Sheets.
  const downloadCsv = () => {
    if (!results || !results.trades) return;
    const cols = ['buy_date', 'buy_price', 'sell_date', 'sell_price', 'return_pct', 'pnl', 'equity_after', 'win'];
    const header = ['#', ...cols].join(',');
    const rows = results.trades.map((t, i) => [i + 1, ...cols.map(c => t[c])].join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${results.ticker}_${results.strategy}_trades.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto">

      {/* Inputs */}
      <div className="p-4 rounded mb-6" style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e' }}>
        <p className="font-mono text-xs mb-4 tracking-widest" style={{ color: '#6b7280' }}>STRATEGY PARAMETERS</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <p className="font-mono text-xs mb-1" style={{ color: '#6b7280' }}>TICKER</p>
            <input
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && (mode === 'sweep' ? runSweep() : run())}
              placeholder="AAPL"
              className="w-full px-3 py-2 font-mono text-sm rounded outline-none"
              style={{ backgroundColor: '#0a0a0f', border: '1px solid #1e1e2e', color: '#e2e2e2' }}
            />
          </div>
          <div>
            <p className="font-mono text-xs mb-1" style={{ color: '#6b7280' }}>PERIOD</p>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="w-full px-3 py-2 font-mono text-sm rounded outline-none"
              style={{ backgroundColor: '#0a0a0f', border: '1px solid #1e1e2e', color: '#e2e2e2' }}
            >
              {periods.map(p => (
                <option key={p} value={p}>{p.toUpperCase()}</option>
              ))}
            </select>
          </div>
          {sweepSupported && mode === 'single' && (
            <>
              <div>
                <p className="font-mono text-xs mb-1" style={{ color: '#6b7280' }}>BUY RSI BELOW</p>
                <input
                  type="number"
                  value={buyRsi}
                  onChange={e => setBuyRsi(e.target.value)}
                  className="w-full px-3 py-2 font-mono text-sm rounded outline-none"
                  style={{ backgroundColor: '#0a0a0f', border: '1px solid #1e1e2e', color: '#e2e2e2' }}
                />
              </div>
              <div>
                <p className="font-mono text-xs mb-1" style={{ color: '#6b7280' }}>SELL RSI ABOVE</p>
                <input
                  type="number"
                  value={sellRsi}
                  onChange={e => setSellRsi(e.target.value)}
                  className="w-full px-3 py-2 font-mono text-sm rounded outline-none"
                  style={{ backgroundColor: '#0a0a0f', border: '1px solid #1e1e2e', color: '#e2e2e2' }}
                />
              </div>
            </>
          )}
        </div>

        <div className="mb-4">
          <p className="font-mono text-xs mb-2" style={{ color: '#6b7280' }}>STRATEGY</p>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'rsi', label: 'RSI' },
              { key: 'macd', label: 'MACD' },
              { key: 'combined', label: 'RSI + MACD' },
              { key: 'golden_cross', label: 'GOLDEN CROSS' },
            ].map(s => (
              <button
                key={s.key}
                onClick={() => pickStrategy(s.key)}
                className="px-3 py-1 font-mono text-xs rounded"
                style={{
                  backgroundColor: strategy === s.key ? '#2563eb20' : 'transparent',
                  border: `1px solid ${strategy === s.key ? '#2563eb' : '#1e1e2e'}`,
                  color: strategy === s.key ? '#2563eb' : '#6b7280',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <p className="font-mono text-xs mb-2" style={{ color: '#6b7280' }}>MODE</p>
          <div className="flex gap-2">
            {[
              { key: 'single', label: 'SINGLE RUN' },
              { key: 'sweep', label: 'PARAMETER SWEEP' },
            ].map(m => {
              const disabled = m.key === 'sweep' && !sweepSupported;
              return (
                <button
                  key={m.key}
                  onClick={() => !disabled && setMode(m.key)}
                  disabled={disabled}
                  title={disabled ? 'Sweep is available for RSI and RSI + MACD strategies' : undefined}
                  className="px-3 py-1 font-mono text-xs rounded"
                  style={{
                    backgroundColor: mode === m.key ? '#2563eb20' : 'transparent',
                    border: `1px solid ${mode === m.key ? '#2563eb' : '#1e1e2e'}`,
                    color: disabled ? '#3a3a44' : (mode === m.key ? '#2563eb' : '#6b7280'),
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => (mode === 'sweep' ? runSweep() : run())}
            className="flex-1 py-3 font-mono text-sm rounded"
            style={{ backgroundColor: '#2563eb', color: '#fff' }}
          >
            {loading
              ? (mode === 'sweep' ? 'RUNNING SWEEP...' : 'RUNNING BACKTEST...')
              : (mode === 'sweep' ? 'RUN SWEEP' : 'RUN BACKTEST')}
          </button>
          {(results || sweepData) && (
            <button
              onClick={copyLink}
              className="px-4 py-3 font-mono text-sm rounded"
              style={{ border: '1px solid #1e1e2e', color: copied ? '#00c896' : '#6b7280' }}
            >
              {copied ? 'COPIED' : 'COPY LINK'}
            </button>
          )}
        </div>
      </div>

      {waking && loading && <ColdStartHint />}
      {error && <p className="font-mono text-sm mb-4" style={{ color: '#ff4d6d' }}>{error}</p>}

      {mode === 'sweep' && sweepData && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-xs" style={{ color: '#6b7280' }}>COLOR BY</span>
            {[
              { key: 'total_return_pct', label: 'RETURN' },
              { key: 'sharpe', label: 'SHARPE' },
              { key: 'win_rate_pct', label: 'WIN RATE' },
            ].map(m => (
              <button
                key={m.key}
                onClick={() => setSweepMetric(m.key)}
                className="px-3 py-1 font-mono text-xs rounded"
                style={{
                  backgroundColor: sweepMetric === m.key ? '#2563eb20' : 'transparent',
                  border: `1px solid ${sweepMetric === m.key ? '#2563eb' : '#1e1e2e'}`,
                  color: sweepMetric === m.key ? '#2563eb' : '#6b7280',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <SweepHeatmap data={sweepData} metric={sweepMetric} onSelect={selectCell} />
        </>
      )}

      {mode === 'single' && results && (
        <>
          <EquityCurveChart data={results.equity_curve} benchmark={results.buy_hold_curve} spy={results.spy_curve} />

          {/* Summary */}
          <div className="p-4 rounded mb-4" style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e' }}>
            <p className="font-mono text-xs mb-4 tracking-widest" style={{ color: '#6b7280' }}>
              {results.ticker} — {results.strategy.toUpperCase().replace('_', ' ')} STRATEGY
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard
                label="TOTAL RETURN"
                value={`${results.total_return_pct > 0 ? '+' : ''}${results.total_return_pct}%`}
                color={results.total_return_pct > 0 ? '#00c896' : '#ff4d6d'}
              />
              <StatCard
                label="ANNUALIZED RETURN (CAGR)"
                value={results.cagr_pct != null ? `${results.cagr_pct > 0 ? '+' : ''}${results.cagr_pct}%` : null}
                color={results.cagr_pct != null ? (results.cagr_pct > 0 ? '#00c896' : '#ff4d6d') : undefined}
              />
              <StatCard
                label="SHARPE"
                value={results.sharpe != null ? results.sharpe.toFixed(2) : null}
                color={sharpeColor(results.sharpe)}
              />
              <StatCard
                label="BUY & HOLD"
                value={`${results.buy_hold_return_pct > 0 ? '+' : ''}${results.buy_hold_return_pct}%`}
              />
              {results.spy_return_pct != null && (
                <StatCard
                  label="SPY"
                  value={`${results.spy_return_pct > 0 ? '+' : ''}${results.spy_return_pct}%`}
                />
              )}
              <StatCard
                label="MAX DRAWDOWN"
                value={`${results.max_drawdown_pct}%`}
                color={results.max_drawdown_pct < 0 ? '#ff4d6d' : '#6b7280'}
              />
              <StatCard
                label="WIN RATE"
                value={`${results.win_rate_pct}%`}
                color={results.win_rate_pct >= 50 ? '#00c896' : '#ff4d6d'}
              />
              <StatCard label="NUM TRADES" value={results.num_trades} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded" style={{ backgroundColor: '#0a0a0f', border: '1px solid #1e1e2e' }}>
                <p className="font-mono text-xs mb-1 tracking-widest" style={{ color: '#00c896' }}>BEST TRADE</p>
                <p className="font-mono text-xs" style={{ color: '#6b7280' }}>
                  {results.best_trade.buy_date} → {results.best_trade.sell_date}
                </p>
                <p className="font-mono text-sm mt-1" style={{ color: '#e2e2e2' }}>
                  ${results.best_trade.buy_price} → ${results.best_trade.sell_price}
                  <span style={{ color: '#00c896' }}> +{results.best_trade.return_pct}%</span>
                </p>
              </div>
              <div className="p-3 rounded" style={{ backgroundColor: '#0a0a0f', border: '1px solid #1e1e2e' }}>
                <p className="font-mono text-xs mb-1 tracking-widest" style={{ color: '#ff4d6d' }}>WORST TRADE</p>
                <p className="font-mono text-xs" style={{ color: '#6b7280' }}>
                  {results.worst_trade.buy_date} → {results.worst_trade.sell_date}
                </p>
                <p className="font-mono text-sm mt-1" style={{ color: '#e2e2e2' }}>
                  ${results.worst_trade.buy_price} → ${results.worst_trade.sell_price}
                  <span style={{ color: '#ff4d6d' }}> {results.worst_trade.return_pct}%</span>
                </p>
              </div>
            </div>
          </div>

          {/* Trade History */}
          <div className="rounded p-4" style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="font-mono text-xs tracking-widest" style={{ color: '#6b7280' }}>TRADE HISTORY</p>
              <button
                onClick={downloadCsv}
                className="px-3 py-1 font-mono text-xs rounded"
                style={{ border: '1px solid #1e1e2e', color: '#6b7280' }}
              >
                EXPORT CSV
              </button>
            </div>
            <div className="space-y-2">
              {results.trades.map((trade, i) => (
                <div key={i} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #1e1e2e' }}>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-xs" style={{ color: '#6b7280' }}>#{i + 1}</span>
                    <span className="font-mono text-xs" style={{ color: '#6b7280' }}>
                      {trade.buy_date} → {trade.sell_date}
                    </span>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="font-mono text-xs" style={{ color: '#e2e2e2' }}>
                      ${trade.buy_price} → ${trade.sell_price}
                    </span>
                    <span className="font-mono text-xs" style={{ color: '#6b7280' }}>
                      BAL ${trade.equity_after?.toLocaleString()}
                    </span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded" style={{
                      backgroundColor: trade.win ? '#00c89620' : '#ff4d6d20',
                      color: trade.win ? '#00c896' : '#ff4d6d',
                    }}>
                      {trade.return_pct > 0 ? '+' : ''}{trade.return_pct}% ({trade.pnl > 0 ? '+' : ''}${trade.pnl?.toLocaleString()})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}