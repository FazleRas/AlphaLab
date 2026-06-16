import { useState } from 'react';
import EquityCurveChart from './EquityCurveChart';

const API = 'https://alphalab-backend.onrender.com';

const StatCard = ({ label, value, color }) => (
  <div className="p-3 rounded" style={{ backgroundColor: '#0a0a0f', border: '1px solid #1e1e2e' }}>
    <p className="font-mono text-xs mb-1 tracking-widest" style={{ color: '#6b7280' }}>{label}</p>
    <p className="font-mono text-sm" style={{ color: color || '#e2e2e2' }}>{value ?? '—'}</p>
  </div>
);

export default function Backtest() {
  const [ticker, setTicker] = useState('');
  const [period, setPeriod] = useState('2y');
  const [buyRsi, setBuyRsi] = useState(30);
  const [sellRsi, setSellRsi] = useState(70);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [strategy, setStrategy] = useState('rsi');

  const periods = ['6mo', '1y', '2y', '5y', 'max'];

  const run = async () => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/backtest/${ticker}?period=${period}&strategy=${strategy}&buy_rsi=${buyRsi}&sell_rsi=${sellRsi}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setResults(null);
      } else {
        setResults(data);
      }
    } catch (e) {
      setError('Failed to run backtest. Is your backend running?');
    }
    setLoading(false);
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
              onKeyDown={e => e.key === 'Enter' && run()}
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
          {(strategy === 'rsi' || strategy === 'combined') && (
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
                onClick={() => setStrategy(s.key)}
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

        <button
          onClick={run}
          className="w-full py-3 font-mono text-sm rounded"
          style={{ backgroundColor: '#2563eb', color: '#fff' }}
        >
          {loading ? 'RUNNING BACKTEST...' : 'RUN BACKTEST'}
        </button>
      </div>

      {error && <p className="font-mono text-sm mb-4" style={{ color: '#ff4d6d' }}>{error}</p>}

      {results && (
        <>
          <EquityCurveChart data={results.equity_curve} benchmark={results.buy_hold_curve} />

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
                label="BUY & HOLD"
                value={`${results.buy_hold_return_pct > 0 ? '+' : ''}${results.buy_hold_return_pct}%`}
              />
              <StatCard
                label="MAX DRAWDOWN"
                value={`${results.max_drawdown_pct}%`}
                color={results.max_drawdown_pct < 0 ? '#ff4d6d' : '#6b7280'}
              />
              <StatCard label="NUM TRADES" value={results.num_trades} />
              <StatCard
                label="WIN RATE"
                value={`${results.win_rate_pct}%`}
                color={results.win_rate_pct >= 50 ? '#00c896' : '#ff4d6d'}
              />
              <StatCard
                label="BEST TRADE"
                value={`+${results.best_trade.return_pct}%`}
                color="#00c896"
              />
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
            <p className="font-mono text-xs mb-4 tracking-widest" style={{ color: '#6b7280' }}>TRADE HISTORY</p>
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