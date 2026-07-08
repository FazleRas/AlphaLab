import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../api';

const fmtPct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`);
const fmtStrategy = (s) => (s || '').toUpperCase().replace('_', ' ');

// A signed-in user's pinned backtest runs. Persistence goes through the
// FastAPI backend (/saved-runs, JWT-verified). Clicking a run re-runs it in
// the backtester via the onLoad callback.
export default function SavedRuns({ user, refreshKey, onLoad }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setRuns([]); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/saved-runs');
      if (!res.ok) throw new Error(`saved-runs ${res.status}`);
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (e) {
      setError('Failed to load your saved runs.');
    }
    setLoading(false);
  }, [user]);

  // Reload on sign-in and whenever a new run is saved (refreshKey bumps).
  useEffect(() => { load(); }, [load, refreshKey]);

  const remove = async (id) => {
    setError(null);
    try {
      const res = await authFetch(`/saved-runs/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`delete ${res.status}`);
      setRuns(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      setError('Failed to delete run.');
    }
  };

  // Public tab, but saved runs are a signed-in-only feature — render nothing
  // until there's a user (keeps the backtester clean for anonymous visitors).
  if (!user) return null;

  return (
    <div className="p-4 rounded mb-6" style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between"
      >
        <span className="font-mono text-xs tracking-widest" style={{ color: '#6b7280' }}>
          SAVED RUNS{runs.length ? ` (${runs.length})` : ''}
        </span>
        <span className="font-mono text-xs" style={{ color: '#6b7280' }}>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-4">
          {error && <p className="font-mono text-xs mb-3" style={{ color: '#ff4d6d' }}>{error}</p>}

          {loading && runs.length === 0 && (
            <p className="font-mono text-xs" style={{ color: '#6b7280' }}>loading...</p>
          )}

          {!loading && runs.length === 0 && !error && (
            <p className="font-mono text-xs" style={{ color: '#6b7280' }}>
              No saved runs yet. Run a single backtest and hit SAVE RUN to pin it here.
            </p>
          )}

          {runs.map(run => {
            const ret = run.metrics?.total_return_pct;
            const sharpe = run.metrics?.sharpe;
            return (
              <div key={run.id}
                   className="flex items-center justify-between py-2"
                   style={{ borderBottom: '1px solid #1e1e2e' }}>
                <button
                  onClick={() => onLoad(run)}
                  title="Load this run in the backtester"
                  className="flex items-center gap-4 text-left flex-1 min-w-0"
                >
                  <span className="font-mono text-sm" style={{ color: '#e2e2e2' }}>{run.ticker}</span>
                  <span className="font-mono text-xs" style={{ color: '#2563eb' }}>{fmtStrategy(run.strategy)}</span>
                  <span className="font-mono text-xs" style={{ color: '#6b7280' }}>{(run.period || '').toUpperCase()}</span>
                  {ret != null && (
                    <span className="font-mono text-xs" style={{ color: ret > 0 ? '#00c896' : '#ff4d6d' }}>
                      {fmtPct(ret)}
                    </span>
                  )}
                  {sharpe != null && (
                    <span className="font-mono text-xs" style={{ color: '#6b7280' }}>
                      SHARPE {Number(sharpe).toFixed(2)}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => remove(run.id)}
                  className="font-mono text-xs px-3 py-1 rounded ml-3"
                  style={{ backgroundColor: '#1e1e2e', color: '#6b7280' }}
                >
                  DELETE
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
