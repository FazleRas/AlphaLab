import { useState } from 'react';

// Sharpe uses fixed bands (matching the stat card); other metrics use a
// diverging scale relative to the grid's own min/max.
const sharpeBand = (s) => {
  if (s == null) return '#6b7280';
  if (s < 0) return '#ff4d6d';
  if (s < 1) return '#f97316';
  if (s < 2) return '#e2e2e2';
  return '#00c896';
};

const lerp = (a, b, t) => Math.round(a + (b - a) * t);
// red (0) → neutral (0.5) → green (1)
const heatColor = (t) => {
  if (t <= 0.5) {
    const u = t / 0.5;
    return `rgb(${lerp(255, 30, u)},${lerp(77, 30, u)},${lerp(109, 46, u)})`;
  }
  const u = (t - 0.5) / 0.5;
  return `rgb(${lerp(30, 0, u)},${lerp(30, 200, u)},${lerp(46, 150, u)})`;
};

const fmt = (metric, v) => {
  if (v == null) return '—';
  if (metric === 'sharpe') return v.toFixed(2);
  return `${Math.round(v)}%`;
};

const METRIC_LABEL = {
  total_return_pct: 'TOTAL RETURN',
  sharpe: 'SHARPE',
  win_rate_pct: 'WIN RATE',
};

export default function SweepHeatmap({ data, metric, onSelect }) {
  const [hover, setHover] = useState(null);
  if (!data || !data.grid) return null;

  const { buy_values, sell_values, grid, best } = data;
  const cellAt = (b, s) => grid.find(c => c.buy_rsi === b && c.sell_rsi === s);

  const vals = grid.map(c => c[metric]).filter(v => v != null);
  const min = Math.min(...vals);
  const max = Math.max(...vals);

  const bg = (v) => {
    if (v == null) return '#0a0a0f';
    if (metric === 'sharpe') return `${sharpeBand(v)}40`;
    const t = max === min ? 0.5 : (v - min) / (max - min);
    return heatColor(t);
  };

  const detail = hover || best;

  return (
    <div className="rounded p-4 mb-4" style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e' }}>
      <p className="font-mono text-xs mb-1 tracking-widest" style={{ color: '#6b7280' }}>
        PARAMETER SWEEP — {METRIC_LABEL[metric]}
      </p>
      <p className="font-mono text-xs mb-4" style={{ color: '#6b7280' }}>
        BUY RSI → (columns) · SELL RSI ↓ (rows) · click a cell to backtest it
      </p>

      <div className="overflow-x-auto">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `40px repeat(${buy_values.length}, minmax(48px, 1fr))`, minWidth: 'min-content' }}
        >
          {/* header row */}
          <div />
          {buy_values.map(b => (
            <div key={`h${b}`} className="font-mono text-xs text-center" style={{ color: '#6b7280' }}>{b}</div>
          ))}

          {/* rows */}
          {sell_values.map(s => (
            <FragmentRow
              key={`r${s}`}
              s={s}
              buy_values={buy_values}
              cellAt={cellAt}
              metric={metric}
              bg={bg}
              best={best}
              onSelect={onSelect}
              setHover={setHover}
            />
          ))}
        </div>
      </div>

      {/* detail line */}
      {detail && (
        <div className="font-mono text-xs mt-4 flex flex-wrap gap-x-6 gap-y-1" style={{ color: '#6b7280' }}>
          <span style={{ color: '#e2e2e2' }}>
            BUY&lt;{detail.buy_rsi} / SELL&gt;{detail.sell_rsi}{detail === best && !hover ? '  (best)' : ''}
          </span>
          <span>RETURN <span style={{ color: '#e2e2e2' }}>{detail.total_return_pct != null ? `${detail.total_return_pct}%` : '—'}</span></span>
          <span>CAGR <span style={{ color: '#e2e2e2' }}>{detail.cagr_pct != null ? `${detail.cagr_pct}%` : '—'}</span></span>
          <span>SHARPE <span style={{ color: sharpeBand(detail.sharpe) }}>{detail.sharpe != null ? detail.sharpe.toFixed(2) : '—'}</span></span>
          <span>WIN <span style={{ color: '#e2e2e2' }}>{detail.win_rate_pct != null ? `${detail.win_rate_pct}%` : '—'}</span></span>
          <span>DD <span style={{ color: '#ff4d6d' }}>{detail.max_drawdown_pct != null ? `${detail.max_drawdown_pct}%` : '—'}</span></span>
          <span>TRADES <span style={{ color: '#e2e2e2' }}>{detail.num_trades ?? '—'}</span></span>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ s, buy_values, cellAt, metric, bg, best, onSelect, setHover }) {
  return (
    <>
      <div className="font-mono text-xs flex items-center justify-end pr-1" style={{ color: '#6b7280' }}>{s}</div>
      {buy_values.map(b => {
        const cell = cellAt(b, s);
        const v = cell ? cell[metric] : null;
        const isBest = best && cell && cell.buy_rsi === best.buy_rsi && cell.sell_rsi === best.sell_rsi;
        return (
          <button
            key={`${b}-${s}`}
            onClick={() => v != null && onSelect(b, s)}
            onMouseEnter={() => setHover(cell)}
            onMouseLeave={() => setHover(null)}
            className="font-mono text-xs rounded text-center py-2"
            style={{
              backgroundColor: bg(v),
              color: v == null ? '#6b7280' : '#e2e2e2',
              border: isBest ? '2px solid #e2e2e2' : '1px solid #1e1e2e',
              cursor: v == null ? 'default' : 'pointer',
            }}
          >
            {fmt(metric, v)}
          </button>
        );
      })}
    </>
  );
}
