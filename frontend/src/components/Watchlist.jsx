import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../api';
import useColdStartHint from '../hooks/useColdStartHint';
import API from '../config';

const rsiColor = (rsi) => {
  if (!rsi) return 'var(--color-text)';
  if (rsi > 70) return 'var(--color-neg)';
  if (rsi < 30) return 'var(--color-pos)';
  return 'var(--color-text)';
};

// Per-user saved tickers. Persistence goes through the FastAPI backend
// (/watchlist, JWT-verified); live price + signals come from /scan.
export default function Watchlist() {
  const [tickers, setTickers] = useState([]);       // saved symbols from the backend
  const [quotes, setQuotes] = useState({});          // ticker -> scan result
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);     // quote fetch in flight
  const [error, setError] = useState(null);
  const waking = useColdStartHint(loading);

  // Pull the saved watchlist for the signed-in user (scoped server-side by JWT).
  const loadWatchlist = useCallback(async () => {
    try {
      const res = await authFetch('/watchlist');
      if (!res.ok) throw new Error(`watchlist ${res.status}`);
      const data = await res.json();
      setTickers(data.tickers || []);
    } catch (e) {
      setError('Failed to load your watchlist.');
    }
  }, []);

  // Fetch live quotes/signals for the saved tickers from the backend.
  const loadQuotes = useCallback(async (symbols) => {
    if (symbols.length === 0) {
      setQuotes({});
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/scan?tickers=${symbols.join(',')}`);
      const data = await res.json();
      const byTicker = {};
      (data.results || []).forEach(r => { byTicker[r.ticker] = r; });
      setQuotes(byTicker);
    } catch (e) {
      setError('Failed to load quotes. Is the backend awake?');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadWatchlist(); }, [loadWatchlist]);
  useEffect(() => { loadQuotes(tickers); }, [tickers, loadQuotes]);

  const addTicker = async () => {
    const symbol = input.trim().toUpperCase();
    if (!symbol || tickers.includes(symbol)) { setInput(''); return; }
    setError(null);
    try {
      const res = await authFetch('/watchlist', {
        method: 'POST',
        body: JSON.stringify({ ticker: symbol }),
      });
      if (!res.ok) throw new Error(`add ${res.status}`);
      setInput('');
      setTickers(prev => [...prev, symbol]);
    } catch (e) {
      setError('Failed to add ticker.');
    }
  };

  const removeTicker = async (symbol) => {
    setError(null);
    try {
      const res = await authFetch(`/watchlist/${symbol}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`remove ${res.status}`);
      setTickers(prev => prev.filter(t => t !== symbol));
    } catch (e) {
      setError('Failed to remove ticker.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Add ticker */}
      <div className="flex gap-3 mb-6">
        <input
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && addTicker()}
          placeholder="Add a ticker: AAPL, NVDA..."
          className="flex-1 px-4 py-3 font-mono text-sm outline-none"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-divider)', color: 'var(--color-text)' }}
        />
        <button
          onClick={addTicker}
          className="px-6 py-3 font-mono text-sm"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
        >
          ADD
        </button>
      </div>

      {waking && loading && (
        <p className="font-mono text-sm mb-4" style={{ color: 'var(--color-accent)' }}>
          Waking up the backend. The first request after idle can take ~30s.
        </p>
      )}
      {error && <p className="font-mono text-sm mb-4" style={{ color: 'var(--color-neg)' }}>{error}</p>}

      {tickers.length === 0 && !loading && (
        <p className="font-mono text-sm" style={{ color: 'var(--color-muted)' }}>
          Your watchlist is empty. Add a ticker above and it'll be saved to your account.
        </p>
      )}

      {tickers.map(symbol => {
        const q = quotes[symbol];
        return (
          <div key={symbol} className="flex items-center justify-between p-4 mb-3"
               style={{ border: '1px solid var(--color-divider)' }}>
            <div className="flex items-center gap-6">
              <span className="font-mono text-lg" style={{ color: 'var(--color-text)' }}>{symbol}</span>
              {q ? (
                <>
                  <span className="font-mono text-sm" style={{ color: 'var(--color-accent)' }}>${q.close}</span>
                  <span className="font-mono text-xs" style={{ color: 'var(--color-muted)' }}>
                    RSI <span style={{ color: rsiColor(q.rsi) }}>{q.rsi}</span>
                  </span>
                  {q.signals?.bullish_trend && (
                    <span className="font-mono text-xs" style={{ color: 'var(--color-pos)' }}>BULLISH</span>
                  )}
                  {q.signals?.bearish_trend && (
                    <span className="font-mono text-xs" style={{ color: 'var(--color-neg)' }}>BEARISH</span>
                  )}
                </>
              ) : (
                <span className="font-mono text-xs" style={{ color: 'var(--color-muted)' }}>
                  {loading ? 'loading...' : '-'}
                </span>
              )}
            </div>
            <button
              onClick={() => removeTicker(symbol)}
              className="btn-remove"
            >
              REMOVE
            </button>
          </div>
        );
      })}
    </div>
  );
}
