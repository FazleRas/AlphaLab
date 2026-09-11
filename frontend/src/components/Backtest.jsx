import { useState, useEffect, useRef } from 'react';
import EquityCurveChart from './EquityCurveChart';
import SweepHeatmap from './SweepHeatmap';
import ValidationPanel from './ValidationPanel';
import CompareView from './CompareView';
import SavedRuns from './SavedRuns';
import AnimatedNumber from './AnimatedNumber';
import { ChartSkeleton, StatGridSkeleton } from './Skeleton';
import useColdStartHint from '../hooks/useColdStartHint';
import { authFetch } from '../api';
import API from '../config';

const ColdStartHint = () => (
  <p className="font-mono text-xs mb-4" style={{ color: 'var(--color-accent)' }}>
    Waking up the backend — the first request after idle can take ~30s.
  </p>
);

// Pass `num` + `format` for a value that should count up into place;
// `value` renders a preformatted string as-is.
const StatCard = ({ label, value, num, format, color }) => (
  <div className="p-3" style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-divider)' }}>
    <p className="font-mono text-xs mb-1 tracking-widest" style={{ color: 'var(--color-muted)' }}>{label}</p>
    <p className="font-mono text-sm" style={{ color: color || 'var(--color-text)' }}>
      {num !== undefined ? <AnimatedNumber value={num} format={format} /> : (value ?? '—')}
    </p>
  </div>
);

const signedPct = (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
const pct = (v) => `${v.toFixed(2)}%`;
const posNeg = (v) => (v > 0 ? 'var(--color-pos)' : 'var(--color-neg)');

// Sharpe color bands: <0 red, 0–1 orange, 1–2 white, >2 green.
const sharpeColor = (s) => {
  if (s == null) return 'var(--color-muted)';
  if (s < 0) return 'var(--color-neg)';
  if (s < 1) return 'var(--color-accent)';
  if (s < 2) return 'var(--color-text)';
  return 'var(--color-pos)';
};

// Sweeps run as a background job on the backend; the UI polls
// GET /sweeps/{id} at this cadence and paints cells as they land.
const SWEEP_POLL_MS = 350;
const SWEEP_TERMINAL = new Set(['done', 'failed', 'cancelled']);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Reshape a /sweeps/{id} state into the shape SweepHeatmap and the
// validation call already consume — the same one GET /sweep/{ticker} returns.
const sweepStateToData = (state) => ({
  ...state.params_grid,
  grid: state.results,
  best: state.best,
  sweep_id: state.sweep_id,
  status: state.status,
});

export default function Backtest({ user }) {
  const [ticker, setTicker] = useState('');
  const [period, setPeriod] = useState('2y');
  const [buyRsi, setBuyRsi] = useState(30);
  const [sellRsi, setSellRsi] = useState(70);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [strategy, setStrategy] = useState('rsi');
  const [mode, setMode] = useState('single'); // 'single' | 'sweep' | 'compare'
  const [sweepData, setSweepData] = useState(null);
  const [compareData, setCompareData] = useState(null);
  const [sweepMetric, setSweepMetric] = useState('total_return_pct');
  const [sweepProgress, setSweepProgress] = useState(null); // { completed, total, status }
  // Bumped whenever a new sweep starts (or the tab unmounts) so a poll loop
  // from an earlier sweep notices it is stale and stops touching state.
  const sweepRun = useRef(0);
  const sweepIdRef = useRef(null);
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const [savedRefresh, setSavedRefresh] = useState(0);
  // Trade the user is pointing at in the history list; lit on the chart.
  const [activeTrade, setActiveTrade] = useState(null);
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
      // A 5xx carries FastAPI's {detail} rather than {error}; without this
      // check it would be rendered as a result and crash on the missing keys.
      if (!res.ok || data.error) {
        setError(data.error || data.detail || `Backend error ${res.status}. The market data source may be flaky - try again.`);
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

  // Poll one sweep until it reaches a terminal state, painting the heatmap on
  // every tick. Resolves to 'done' | 'expired' | 'error' | 'stale' — 'stale'
  // means a newer sweep took over and this loop must not touch state again.
  // sweepIdRef holds the id only while the sweep is in flight.
  const pollSweep = async (id) => {
    const run = ++sweepRun.current;
    const live = () => sweepRun.current === run;
    sweepIdRef.current = id;
    let outcome = 'done';
    try {
      for (;;) {
        const res = await fetch(`${API}/sweeps/${id}`);
        if (!live()) return 'stale';
        if (res.status === 404) { outcome = 'expired'; break; }
        if (!res.ok) throw new Error(`sweep ${res.status}`);
        const state = await res.json();
        if (!live()) return 'stale';
        setSweepData(sweepStateToData(state));
        setSweepProgress({ completed: state.completed, total: state.total, status: state.status });
        if (SWEEP_TERMINAL.has(state.status)) {
          if (state.status === 'failed') setError(state.error || 'Sweep failed');
          break;
        }
        await sleep(SWEEP_POLL_MS);
        if (!live()) return 'stale';
      }
    } catch (e) {
      if (!live()) return 'stale';
      setError('Lost contact with the sweep. Is your backend running?');
      outcome = 'error';
    }
    sweepIdRef.current = null;
    setLoading(false);
    return outcome;
  };

  // Ask the backend to stop the in-flight sweep, if there is one. Used by the
  // CANCEL button and when a new sweep supersedes a running one, so a
  // re-click doesn't leave an orphaned job burning the rest of its grid.
  const cancelSweep = async () => {
    const id = sweepIdRef.current;
    if (!id) return;
    try {
      await fetch(`${API}/sweeps/${id}`, { method: 'DELETE' });
    } catch (e) {
      // The poll loop reports connectivity problems; nothing extra to say.
    }
  };

  const runSweep = async (opts = {}) => {
    const tk = (opts.ticker ?? ticker).toUpperCase();
    const per = opts.period ?? period;
    const strat = opts.strategy ?? strategy;
    if (!tk) return;
    setLoading(true);
    setError(null);
    setValidation(null); // stale validation belongs to the previous sweep
    cancelSweep(); // supersede any sweep still running; no need to await it
    let started;
    try {
      const res = await fetch(`${API}/sweeps/${tk}?period=${per}&strategy=${strat}`, { method: 'POST' });
      if (res.status === 404 || res.status === 405) {
        // The backend predates async sweeps (a deploy that rolled back, or
        // an older self-hosted build). Run the synchronous endpoint instead:
        // same grid, no progress, nothing to resume or cancel.
        await runSweepSync(tk, per, strat);
        return;
      }
      started = await res.json();
    } catch (e) {
      setError('Failed to run sweep. Is your backend running?');
      setLoading(false);
      return;
    }
    if (started.error || !started.sweep_id) {
      setError(started.error || 'Failed to start sweep.');
      setSweepData(null);
      setLoading(false);
      return;
    }
    setSweepData(null);
    setSweepProgress({ completed: 0, total: started.total, status: started.status });
    syncUrl({ ticker: tk, period: per, strategy: strat, mode: 'sweep', sweep: started.sweep_id });
    if ((await pollSweep(started.sweep_id)) === 'expired') {
      setError('That sweep has expired. Run it again.');
    }
  };

  const runSweepSync = async (tk, per, strat) => {
    try {
      const res = await fetch(`${API}/sweep/${tk}?period=${per}&strategy=${strat}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setSweepData(null);
      } else {
        setSweepData(data);
        setSweepProgress(null);
        syncUrl({ ticker: tk, period: per, strategy: strat, mode: 'sweep' });
      }
    } catch (e) {
      setError('Failed to run sweep. Is your backend running?');
    }
    setLoading(false);
  };

  // A refreshed or shared URL carries the sweep id: reattach to the running
  // (or finished) sweep instead of starting over — unless the backend has
  // already forgotten it, in which case start a fresh one with the same inputs.
  const resumeSweep = async (id, params) => {
    setLoading(true);
    setError(null);
    if ((await pollSweep(id)) === 'expired') runSweep(params);
  };

  // Stop polling when the tab unmounts; the sweep itself keeps running on
  // the backend and the URL still points at it.
  useEffect(() => () => { sweepRun.current += 1; }, []);

  // Race all four strategies on the same ticker and window.
  const runCompare = async (opts = {}) => {
    const tk = (opts.ticker ?? ticker).toUpperCase();
    const per = opts.period ?? period;
    const b = opts.buyRsi ?? buyRsi;
    const s = opts.sellRsi ?? sellRsi;
    if (!tk) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/compare/${tk}?period=${per}&buy_rsi=${b}&sell_rsi=${s}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || data.detail || `Backend error ${res.status}. The market data source may be flaky - try again.`);
        setCompareData(null);
      } else {
        setCompareData(data);
        syncUrl({ ticker: tk, period: per, buy_rsi: b, sell_rsi: s, mode: 'compare' });
      }
    } catch (e) {
      setError('Failed to run comparison. Is your backend running?');
    }
    setLoading(false);
  };

  // Re-run the sweep's top combos on a held-out test window they never saw.
  const runValidation = async () => {
    if (!sweepData) return;
    setValidating(true);
    setError(null);
    try {
      const res = await fetch(`${API}/validate/${sweepData.ticker}?period=${sweepData.period}&strategy=${sweepData.strategy}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setValidation(null);
      } else {
        setValidation(data);
      }
    } catch (e) {
      setError('Failed to run validation. Is your backend running?');
    }
    setValidating(false);
  };

  // Click a heatmap cell → drill into a full single backtest of that combo.
  const selectCell = (b, s) => {
    setBuyRsi(b);
    setSellRsi(s);
    setMode('single');
    run({ buyRsi: b, sellRsi: s });
  };

  const runCurrent = () => {
    if (mode === 'sweep') runSweep();
    else if (mode === 'compare') runCompare();
    else run();
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Pin the current single-run backtest to the signed-in user's saved runs.
  const saveRun = async () => {
    if (!results) return;
    setSaveState('saving');
    try {
      const res = await authFetch('/saved-runs', {
        method: 'POST',
        body: JSON.stringify({
          ticker: results.ticker,
          strategy: results.strategy,
          period,
          params: { buy_rsi: Number(buyRsi), sell_rsi: Number(sellRsi) },
          metrics: {
            total_return_pct: results.total_return_pct,
            cagr_pct: results.cagr_pct,
            sharpe: results.sharpe,
            max_drawdown_pct: results.max_drawdown_pct,
            win_rate_pct: results.win_rate_pct,
            num_trades: results.num_trades,
          },
        }),
      });
      if (!res.ok) throw new Error(`save ${res.status}`);
      setSaveState('saved');
      setSavedRefresh(n => n + 1);
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (e) {
      setError('Failed to save run. Are you still signed in?');
      setSaveState('idle');
    }
  };

  // Re-run a saved run in the backtester: restore its inputs and execute.
  const loadSavedRun = (savedRun) => {
    const tk = savedRun.ticker;
    const per = savedRun.period || '2y';
    const strat = savedRun.strategy || 'rsi';
    const b = savedRun.params?.buy_rsi ?? 30;
    const s = savedRun.params?.sell_rsi ?? 70;
    setTicker(tk);
    setPeriod(per);
    setStrategy(strat);
    setBuyRsi(b);
    setSellRsi(s);
    setMode('single');
    run({ ticker: tk, period: per, strategy: strat, buyRsi: b, sellRsi: s });
  };

  // On load, restore a shared backtest from the URL and run it automatically.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const tk = p.get('ticker');
    if (!tk) return;
    const per = p.get('period') || '2y';
    const strat = p.get('strategy') || 'rsi';
    const b = p.get('buy_rsi'); const s = p.get('sell_rsi');
    const md = ['sweep', 'compare'].includes(p.get('mode')) ? p.get('mode') : 'single';
    setTicker(tk.toUpperCase());
    setPeriod(per);
    setStrategy(strat);
    setMode(md);
    if (b != null) setBuyRsi(b);
    if (s != null) setSellRsi(s);
    if (md === 'sweep') {
      const sweepParams = { ticker: tk, period: per, strategy: strat };
      const sid = p.get('sweep');
      if (sid) resumeSweep(sid, sweepParams);
      else runSweep(sweepParams);
    }
    else if (md === 'compare') runCompare({ ticker: tk, period: per, buyRsi: b ?? 30, sellRsi: s ?? 70 });
    else run({ ticker: tk, period: per, strategy: strat, buyRsi: b ?? 30, sellRsi: s ?? 70 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickStrategy = (key) => {
    setStrategy(key);
    if (key !== 'rsi' && key !== 'combined' && mode === 'sweep') setMode('single');
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

      {/* Saved runs (signed-in only) */}
      <SavedRuns user={user} refreshKey={savedRefresh} onLoad={loadSavedRun} />

      {/* Inputs */}
      <div className="p-4 mb-6" style={{ border: '1px solid var(--color-divider)' }}>
        <p className="font-mono text-xs mb-4 tracking-widest" style={{ color: 'var(--color-muted)' }}>STRATEGY PARAMETERS</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <p className="font-mono text-xs mb-1" style={{ color: 'var(--color-muted)' }}>TICKER</p>
            <input
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && runCurrent()}
              placeholder="AAPL"
              className="w-full px-3 py-2 font-mono text-sm outline-none"
              style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-divider)', color: 'var(--color-text)' }}
            />
          </div>
          <div>
            <p className="font-mono text-xs mb-1" style={{ color: 'var(--color-muted)' }}>PERIOD</p>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="w-full px-3 py-2 font-mono text-sm outline-none"
              style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-divider)', color: 'var(--color-text)' }}
            >
              {periods.map(p => (
                <option key={p} value={p}>{p.toUpperCase()}</option>
              ))}
            </select>
          </div>
          {((sweepSupported && mode === 'single') || mode === 'compare') && (
            <>
              <div>
                <p className="font-mono text-xs mb-1" style={{ color: 'var(--color-muted)' }}>BUY RSI BELOW</p>
                <input
                  type="number"
                  value={buyRsi}
                  onChange={e => setBuyRsi(e.target.value)}
                  className="w-full px-3 py-2 font-mono text-sm outline-none"
                  style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-divider)', color: 'var(--color-text)' }}
                />
              </div>
              <div>
                <p className="font-mono text-xs mb-1" style={{ color: 'var(--color-muted)' }}>SELL RSI ABOVE</p>
                <input
                  type="number"
                  value={sellRsi}
                  onChange={e => setSellRsi(e.target.value)}
                  className="w-full px-3 py-2 font-mono text-sm outline-none"
                  style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-divider)', color: 'var(--color-text)' }}
                />
              </div>
            </>
          )}
        </div>

        {mode !== 'compare' && (
        <div className="mb-4">
          <p className="font-mono text-xs mb-2" style={{ color: 'var(--color-muted)' }}>STRATEGY</p>
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
                className={`chip${strategy === s.key ? ' chip--on' : ''}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        )}

        <div className="mb-4">
          <p className="font-mono text-xs mb-2" style={{ color: 'var(--color-muted)' }}>MODE</p>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'single', label: 'SINGLE RUN' },
              { key: 'sweep', label: 'PARAMETER SWEEP' },
              { key: 'compare', label: 'COMPARE ALL' },
            ].map(m => {
              const disabled = m.key === 'sweep' && !sweepSupported;
              return (
                <button
                  key={m.key}
                  onClick={() => !disabled && setMode(m.key)}
                  disabled={disabled}
                  title={disabled ? 'Sweep is available for RSI and RSI + MACD strategies' : undefined}
                  className={`chip${mode === m.key ? ' chip--on' : ''}`}
                  style={{
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
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
            onClick={runCurrent}
            className="flex-1 py-3 font-mono text-sm"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            {loading
              ? {
                  single: 'RUNNING BACKTEST...',
                  sweep: sweepProgress && sweepProgress.total
                    ? `RUNNING SWEEP... ${sweepProgress.completed} / ${sweepProgress.total}`
                    : 'RUNNING SWEEP...',
                  compare: 'COMPARING STRATEGIES...',
                }[mode]
              : { single: 'RUN BACKTEST', sweep: 'RUN SWEEP', compare: 'COMPARE ALL STRATEGIES' }[mode]}
          </button>
          {mode === 'sweep' && loading && sweepProgress && (
            <button
              onClick={cancelSweep}
              className="px-4 py-3 font-mono text-sm"
              style={{ border: '1px solid var(--color-divider)', color: 'var(--color-muted)' }}
            >
              CANCEL
            </button>
          )}
          {mode === 'single' && results && user && (
            <button
              onClick={saveRun}
              disabled={saveState === 'saving'}
              className="px-4 py-3 font-mono text-sm"
              style={{ border: `1px solid ${saveState === 'saved' ? 'var(--color-pos)' : 'var(--color-divider)'}`,
                       color: saveState === 'saved' ? 'var(--color-pos)' : 'var(--color-muted)' }}
            >
              {{ idle: 'SAVE RUN', saving: 'SAVING...', saved: 'SAVED' }[saveState]}
            </button>
          )}
          {(results || sweepData || compareData) && (
            <button
              onClick={copyLink}
              className="px-4 py-3 font-mono text-sm"
              style={{ border: '1px solid var(--color-divider)', color: copied ? 'var(--color-pos)' : 'var(--color-muted)' }}
            >
              {copied ? 'COPIED' : 'COPY LINK'}
            </button>
          )}
        </div>
      </div>

      {waking && loading && <ColdStartHint />}
      {error && <p className="font-mono text-sm mb-4" style={{ color: 'var(--color-neg)' }}>{error}</p>}

      {mode === 'compare' && loading && <ChartSkeleton height={300} className="mb-4" />}
      {mode === 'compare' && !loading && compareData && <div className="fade-up"><CompareView data={compareData} /></div>}

      {mode === 'sweep' && sweepData && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-xs" style={{ color: 'var(--color-muted)' }}>COLOR BY</span>
            {[
              { key: 'total_return_pct', label: 'RETURN' },
              { key: 'sharpe', label: 'SHARPE' },
              { key: 'win_rate_pct', label: 'WIN RATE' },
            ].map(m => (
              <button
                key={m.key}
                onClick={() => setSweepMetric(m.key)}
                className={`chip${sweepMetric === m.key ? ' chip--on' : ''}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <SweepHeatmap data={sweepData} metric={sweepMetric} progress={sweepProgress} onSelect={selectCell} />

          {!validation && !loading && (
            <button
              onClick={runValidation}
              disabled={validating}
              className="w-full py-3 mb-4 font-mono text-sm"
              style={{ border: '1px solid var(--color-accent)', color: 'var(--color-accent)', backgroundColor: 'transparent' }}
            >
              {validating ? 'VALIDATING OUT-OF-SAMPLE...' : 'VALIDATE TOP 3 OUT-OF-SAMPLE'}
            </button>
          )}
          <ValidationPanel data={validation} />
        </>
      )}

      {mode === 'single' && loading && (
        <div className="fade-up">
          <ChartSkeleton height={300} className="mb-4" />
          <StatGridSkeleton className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4" />
        </div>
      )}

      {mode === 'single' && !loading && results && (
        <div className="fade-up">
          <EquityCurveChart
            data={results.equity_curve}
            benchmark={results.buy_hold_curve}
            spy={results.spy_curve}
            trades={results.trades}
            activeTrade={activeTrade}
          />

          {/* Summary */}
          <div className="p-4 mb-4" style={{ border: '1px solid var(--color-divider)' }}>
            <p className="font-mono text-xs mb-4 tracking-widest" style={{ color: 'var(--color-muted)' }}>
              {results.ticker} — {results.strategy.toUpperCase().replace('_', ' ')} STRATEGY
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard
                label="TOTAL RETURN"
                num={results.total_return_pct}
                format={signedPct}
                color={posNeg(results.total_return_pct)}
              />
              <StatCard
                label="ANNUALIZED RETURN (CAGR)"
                num={results.cagr_pct}
                format={signedPct}
                color={results.cagr_pct != null ? posNeg(results.cagr_pct) : undefined}
              />
              <StatCard
                label="SHARPE"
                num={results.sharpe}
                format={v => v.toFixed(2)}
                color={sharpeColor(results.sharpe)}
              />
              <StatCard label="BUY & HOLD" num={results.buy_hold_return_pct} format={signedPct} />
              {results.spy_return_pct != null && (
                <StatCard label="SPY" num={results.spy_return_pct} format={signedPct} />
              )}
              <StatCard
                label="MAX DRAWDOWN"
                num={results.max_drawdown_pct}
                format={pct}
                color={results.max_drawdown_pct < 0 ? 'var(--color-neg)' : 'var(--color-muted)'}
              />
              <StatCard
                label="WIN RATE"
                num={results.win_rate_pct}
                format={pct}
                color={results.win_rate_pct >= 50 ? 'var(--color-pos)' : 'var(--color-neg)'}
              />
              <StatCard label="NUM TRADES" num={results.num_trades} format={v => String(Math.round(v))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3" style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-divider)' }}>
                <p className="font-mono text-xs mb-1 tracking-widest" style={{ color: 'var(--color-pos)' }}>BEST TRADE</p>
                <p className="font-mono text-xs" style={{ color: 'var(--color-muted)' }}>
                  {results.best_trade.buy_date} → {results.best_trade.sell_date}
                </p>
                <p className="font-mono text-sm mt-1" style={{ color: 'var(--color-text)' }}>
                  ${results.best_trade.buy_price} → ${results.best_trade.sell_price}
                  <span style={{ color: 'var(--color-pos)' }}> +{results.best_trade.return_pct}%</span>
                </p>
              </div>
              <div className="p-3" style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-divider)' }}>
                <p className="font-mono text-xs mb-1 tracking-widest" style={{ color: 'var(--color-neg)' }}>WORST TRADE</p>
                <p className="font-mono text-xs" style={{ color: 'var(--color-muted)' }}>
                  {results.worst_trade.buy_date} → {results.worst_trade.sell_date}
                </p>
                <p className="font-mono text-sm mt-1" style={{ color: 'var(--color-text)' }}>
                  ${results.worst_trade.buy_price} → ${results.worst_trade.sell_price}
                  <span style={{ color: 'var(--color-neg)' }}> {results.worst_trade.return_pct}%</span>
                </p>
              </div>
            </div>
          </div>

          {/* Trade History */}
          <div className="p-4" style={{ border: '1px solid var(--color-divider)' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-muted)' }}>TRADE HISTORY</p>
              <button
                onClick={downloadCsv}
                className="px-3 py-1 font-mono text-xs"
                style={{ border: '1px solid var(--color-divider)', color: 'var(--color-muted)' }}
              >
                EXPORT CSV
              </button>
            </div>
            <div className="space-y-2">
              {results.trades.map((trade, i) => (
                <div
                  key={i}
                  className={`trade-row flex items-center justify-between py-2${activeTrade === i ? ' trade-row--active' : ''}`}
                  style={{ borderBottom: '1px solid var(--color-hairline)' }}
                  onMouseEnter={() => setActiveTrade(i)}
                  onMouseLeave={() => setActiveTrade(null)}
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-xs" style={{ color: 'var(--color-muted)' }}>#{i + 1}</span>
                    <span className="font-mono text-xs" style={{ color: 'var(--color-muted)' }}>
                      {trade.buy_date} → {trade.sell_date}
                    </span>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="font-mono text-xs" style={{ color: 'var(--color-text)' }}>
                      ${trade.buy_price} → ${trade.sell_price}
                    </span>
                    <span className="font-mono text-xs" style={{ color: 'var(--color-muted)' }}>
                      BAL ${trade.equity_after?.toLocaleString()}
                    </span>
                    <span className="font-mono text-xs" style={{
                      color: trade.win ? 'var(--color-pos)' : 'var(--color-neg)',
                    }}>
                      {trade.return_pct > 0 ? '+' : ''}{trade.return_pct}% ({trade.pnl > 0 ? '+' : ''}${trade.pnl?.toLocaleString()})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}