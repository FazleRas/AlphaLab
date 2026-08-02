const fmtPct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`);
const fmtSharpe = (v) => (v == null ? '—' : v.toFixed(2));

// Verdict for how a train-window winner fared on data it never saw.
const verdict = (test, benchmark) => {
  if (test == null) return { label: 'NO TRADES', color: 'var(--color-muted)' };
  if (test <= 0) return { label: 'DEGRADED', color: 'var(--color-neg)' };
  if (test > benchmark) return { label: 'HELD UP', color: 'var(--color-pos)' };
  return { label: 'LAGGED B&H', color: 'var(--color-accent)' };
};

export default function ValidationPanel({ data }) {
  if (!data || !data.results) return null;

  return (
    <div className="p-4 mb-4" style={{ border: '1px solid var(--color-divider)' }}>
      <p className="font-mono text-xs mb-1 tracking-widest" style={{ color: 'var(--color-muted)' }}>
        OUT-OF-SAMPLE VALIDATION — TRAIN {Math.round(data.split * 100)}% / TEST {Math.round((1 - data.split) * 100)}%
      </p>
      <p className="font-mono text-xs mb-4" style={{ color: 'var(--color-muted)' }}>
        Optimized on {data.train_start} → {data.train_end}, then tested blind on {data.test_start} → {data.test_end}.
        Test-window buy & hold: <span style={{ color: 'var(--color-text)' }}>{fmtPct(data.test_buy_hold_return_pct)}</span>
      </p>

      <div className="space-y-2">
        {data.results.map((r) => {
          const v = verdict(r.test.total_return_pct, data.test_buy_hold_return_pct);
          return (
            <div
              key={`${r.buy_rsi}-${r.sell_rsi}`}
              className="flex items-center justify-between gap-4 py-2 flex-wrap"
              style={{ borderBottom: '1px solid var(--color-hairline)' }}
            >
              <span className="font-mono text-xs" style={{ color: 'var(--color-text)' }}>
                BUY&lt;{r.buy_rsi} / SELL&gt;{r.sell_rsi}
              </span>
              <span className="font-mono text-xs" style={{ color: 'var(--color-muted)' }}>
                TRAIN <span style={{ color: 'var(--color-text)' }}>{fmtPct(r.train.total_return_pct)}</span>
                {' '}<span style={{ color: 'var(--color-muted)' }}>({fmtSharpe(r.train.sharpe)} sharpe)</span>
              </span>
              <span className="font-mono text-xs" style={{ color: 'var(--color-muted)' }}>
                TEST <span style={{ color: r.test.total_return_pct > 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}>
                  {fmtPct(r.test.total_return_pct)}
                </span>
                {' '}<span style={{ color: 'var(--color-muted)' }}>({fmtSharpe(r.test.sharpe)} sharpe)</span>
              </span>
              <span
                className="font-mono text-xs px-2 py-0.5"
                style={{ backgroundColor: `${v.color}20`, color: v.color }}
              >
                {v.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="font-mono text-xs mt-4" style={{ color: 'var(--color-muted)' }}>
        A robust edge should stay profitable on unseen data. Big train→test drops mean the parameters were fit to noise.
      </p>
    </div>
  );
}
