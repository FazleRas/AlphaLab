import { useState } from 'react';

// Sharpe uses fixed bands (matching the stat card); other metrics use a
// diverging scale relative to the grid's own min/max.
const sharpeBand = (s) => {
  if (s == null) return 'var(--color-muted)';
  if (s < 0) return 'var(--color-neg)';
  if (s < 1) return 'var(--color-accent)';
  if (s < 2) return 'var(--color-text)';
  return 'var(--color-pos)';
};

const lerp = (a, b, t) => Math.round(a + (b - a) * t);
// Loss #ff2f45 → near-black (break-even) → gain #00c9a0. These are literal
// rather than tokens because the ramp has to interpolate between the
// endpoints, which CSS variables can't do here; they track --color-neg and
// --color-pos by hand.
const HEAT_LOSS = [255, 47, 69];
const HEAT_MID = [18, 18, 18];
const HEAT_GAIN = [0, 201, 160];

const heatColor = (t) => {
  const [from, to, u] = t <= 0.5
    ? [HEAT_LOSS, HEAT_MID, t / 0.5]
    : [HEAT_MID, HEAT_GAIN, (t - 0.5) / 0.5];
  return `rgb(${lerp(from[0], to[0], u)},${lerp(from[1], to[1], u)},${lerp(from[2], to[2], u)})`;
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

const STATUS_LABEL = {
  pending: 'STARTING',
  running: 'RUNNING',
  cancelled: 'CANCELLED',
  failed: 'FAILED',
};

// `progress` ({ completed, total, status }) is present while a sweep is
// polled from the backend; cells not yet in `grid` render as pending.
// Without it (a finished sweep with every cell present) nothing changes.
export default function SweepHeatmap({ data, metric, progress, onSelect }) {
  const [hover, setHover] = useState(null);
  if (!data || !data.grid) return null;

  const { buy_values, sell_values, grid, best } = data;
  const cellAt = (b, s) => grid.find(c => c.buy_rsi === b && c.sell_rsi === s);

  // Colors are normalized to the cells seen so far, so the ramp settles as
  // the grid fills in — the same rule as a finished grid, applied early.
  const vals = grid.map(c => c[metric]).filter(v => v != null);
  const min = Math.min(...vals);
  const max = Math.max(...vals);

  const bg = (v) => {
    if (v == null) return 'var(--color-bg)';
    if (metric === 'sharpe') return `${sharpeBand(v)}40`;
    const t = max === min ? 0.5 : (v - min) / (max - min);
    return heatColor(t);
  };

  const detail = hover || best;
  const inFlight = progress && (progress.status === 'pending' || progress.status === 'running');
  const showProgress = progress && progress.total && progress.status !== 'done';
  const pct = showProgress ? Math.round((progress.completed / progress.total) * 100) : 100;

  return (
    <div className="p-4 mb-4" style={{ border: '1px solid var(--color-divider)' }}>
      <div className="flex items-center justify-between gap-4 mb-1">
        <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-muted)' }}>
          PARAMETER SWEEP — {METRIC_LABEL[metric]}
        </p>
        {showProgress && (
          <p
            className="font-mono text-xs tracking-widest"
            style={{ color: inFlight ? 'var(--color-accent)' : 'var(--color-muted)' }}
            aria-live="polite"
          >
            {STATUS_LABEL[progress.status] || progress.status.toUpperCase()} · {progress.completed} / {progress.total}
          </p>
        )}
      </div>
      <p className="font-mono text-xs mb-3" style={{ color: 'var(--color-muted)' }}>
        BUY RSI → (columns) · SELL RSI ↓ (rows) · click a cell to backtest it
      </p>
      {showProgress && (
        <div
          className="mb-3"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.completed}
          style={{ height: '2px', backgroundColor: 'var(--color-hairline)' }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              backgroundColor: inFlight ? 'var(--color-accent)' : 'var(--color-muted)',
              transition: 'width 200ms linear',
            }}
          />
        </div>
      )}

      <div className="overflow-x-auto">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `40px repeat(${buy_values.length}, minmax(48px, 1fr))`, minWidth: 'min-content' }}
        >
          {/* header row */}
          <div />
          {buy_values.map(b => (
            <div key={`h${b}`} className="font-mono text-xs text-center" style={{ color: 'var(--color-muted)' }}>{b}</div>
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
        <div className="font-mono text-xs mt-4 flex flex-wrap gap-x-6 gap-y-1" style={{ color: 'var(--color-muted)' }}>
          <span style={{ color: 'var(--color-text)' }}>
            BUY&lt;{detail.buy_rsi} / SELL&gt;{detail.sell_rsi}{detail === best && !hover ? '  (best)' : ''}
          </span>
          <span>RETURN <span style={{ color: 'var(--color-text)' }}>{detail.total_return_pct != null ? `${detail.total_return_pct}%` : '—'}</span></span>
          <span>CAGR <span style={{ color: 'var(--color-text)' }}>{detail.cagr_pct != null ? `${detail.cagr_pct}%` : '—'}</span></span>
          <span>SHARPE <span style={{ color: sharpeBand(detail.sharpe) }}>{detail.sharpe != null ? detail.sharpe.toFixed(2) : '—'}</span></span>
          <span>WIN <span style={{ color: 'var(--color-text)' }}>{detail.win_rate_pct != null ? `${detail.win_rate_pct}%` : '—'}</span></span>
          <span>DD <span style={{ color: 'var(--color-neg)' }}>{detail.max_drawdown_pct != null ? `${detail.max_drawdown_pct}%` : '—'}</span></span>
          <span>TRADES <span style={{ color: 'var(--color-text)' }}>{detail.num_trades ?? '—'}</span></span>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ s, buy_values, cellAt, metric, bg, best, onSelect, setHover }) {
  return (
    <>
      <div className="font-mono text-xs flex items-center justify-end pr-1" style={{ color: 'var(--color-muted)' }}>{s}</div>
      {buy_values.map(b => {
        const cell = cellAt(b, s);
        // A missing cell hasn't been computed yet (sweep still running or
        // cancelled early); a present cell with a null metric never traded.
        if (!cell) {
          return (
            <div
              key={`${b}-${s}`}
              data-pending="true"
              aria-label={`BUY<${b} / SELL>${s} pending`}
              className="font-mono text-xs text-center py-2"
              style={{ color: 'var(--color-muted)', border: '1px dashed var(--color-hairline)' }}
            >
              ·
            </div>
          );
        }
        const v = cell[metric];
        const isBest = best && cell.buy_rsi === best.buy_rsi && cell.sell_rsi === best.sell_rsi;
        return (
          <button
            key={`${b}-${s}`}
            onClick={() => v != null && onSelect(b, s)}
            onMouseEnter={() => setHover(cell)}
            onMouseLeave={() => setHover(null)}
            className="font-mono text-xs text-center py-2"
            style={{
              backgroundColor: bg(v),
              color: v == null ? 'var(--color-muted)' : 'var(--color-text)',
              border: isBest ? '2px solid var(--color-text)' : '1px solid var(--color-divider)',
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
