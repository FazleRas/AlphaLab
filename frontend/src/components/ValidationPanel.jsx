const fmtPct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`);
const fmtSharpe = (v) => (v == null ? '—' : v.toFixed(2));

// Verdict for how a train-window winner fared on data it never saw.
const verdict = (test, benchmark) => {
  if (test == null) return { label: 'NO TRADES', color: '#6b7280' };
  if (test <= 0) return { label: 'DEGRADED', color: '#ff4d6d' };
  if (test > benchmark) return { label: 'HELD UP', color: '#00c896' };
  return { label: 'LAGGED B&H', color: '#f97316' };
};

export default function ValidationPanel({ data }) {
  if (!data || !data.results) return null;

  return (
    <div className="rounded p-4 mb-4" style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e' }}>
      <p className="font-mono text-xs mb-1 tracking-widest" style={{ color: '#6b7280' }}>
        OUT-OF-SAMPLE VALIDATION — TRAIN {Math.round(data.split * 100)}% / TEST {Math.round((1 - data.split) * 100)}%
      </p>
      <p className="font-mono text-xs mb-4" style={{ color: '#6b7280' }}>
        Optimized on {data.train_start} → {data.train_end}, then tested blind on {data.test_start} → {data.test_end}.
        Test-window buy & hold: <span style={{ color: '#e2e2e2' }}>{fmtPct(data.test_buy_hold_return_pct)}</span>
      </p>

      <div className="space-y-2">
        {data.results.map((r) => {
          const v = verdict(r.test.total_return_pct, data.test_buy_hold_return_pct);
          return (
            <div
              key={`${r.buy_rsi}-${r.sell_rsi}`}
              className="flex items-center justify-between gap-4 py-2 flex-wrap"
              style={{ borderBottom: '1px solid #1e1e2e' }}
            >
              <span className="font-mono text-xs" style={{ color: '#e2e2e2' }}>
                BUY&lt;{r.buy_rsi} / SELL&gt;{r.sell_rsi}
              </span>
              <span className="font-mono text-xs" style={{ color: '#6b7280' }}>
                TRAIN <span style={{ color: '#e2e2e2' }}>{fmtPct(r.train.total_return_pct)}</span>
                {' '}<span style={{ color: '#3a3a44' }}>({fmtSharpe(r.train.sharpe)} sharpe)</span>
              </span>
              <span className="font-mono text-xs" style={{ color: '#6b7280' }}>
                TEST <span style={{ color: r.test.total_return_pct > 0 ? '#00c896' : '#ff4d6d' }}>
                  {fmtPct(r.test.total_return_pct)}
                </span>
                {' '}<span style={{ color: '#3a3a44' }}>({fmtSharpe(r.test.sharpe)} sharpe)</span>
              </span>
              <span
                className="font-mono text-xs px-2 py-0.5 rounded"
                style={{ backgroundColor: `${v.color}20`, color: v.color }}
              >
                {v.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="font-mono text-xs mt-4" style={{ color: '#6b7280' }}>
        A robust edge should stay profitable on unseen data. Big train→test drops mean the parameters were fit to noise.
      </p>
    </div>
  );
}
