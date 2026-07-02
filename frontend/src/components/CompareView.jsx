import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

const STRATEGY_META = {
  rsi: { label: 'RSI', color: '#2563eb' },
  macd: { label: 'MACD', color: '#f97316' },
  combined: { label: 'RSI + MACD', color: '#a855f7' },
  golden_cross: { label: 'GOLDEN CROSS', color: '#eab308' },
};

const sharpeColor = (s) => {
  if (s == null) return '#6b7280';
  if (s < 0) return '#ff4d6d';
  if (s < 1) return '#f97316';
  if (s < 2) return '#e2e2e2';
  return '#00c896';
};

const fmtPct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`);
const formatDate = (time) => new Date(time).toLocaleDateString();

// Merge sparse per-strategy equity curves and the daily buy & hold curve onto
// one time axis; recharts connects the gaps per series via connectNulls.
const buildRows = (data) => {
  const byTime = new Map();
  const rowAt = (ts) => {
    const time = new Date(ts).getTime();
    if (!byTime.has(time)) byTime.set(time, { time });
    return byTime.get(time);
  };
  data.buy_hold_curve.forEach(p => { rowAt(p.timestamp).buyHold = p.equity; });
  data.strategies.forEach(s => {
    s.equity_curve.forEach(p => { rowAt(p.timestamp)[s.strategy] = p.equity; });
  });
  return [...byTime.values()].sort((a, b) => a.time - b.time);
};

export default function CompareView({ data }) {
  if (!data || !data.strategies) return null;

  const rows = buildRows(data);
  const ranked = [...data.strategies].sort(
    (a, b) => (b.total_return_pct ?? -Infinity) - (a.total_return_pct ?? -Infinity)
  );

  return (
    <>
      <div className="rounded p-4 mb-4" style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e' }}>
        <p className="font-mono text-xs mb-4 tracking-widest" style={{ color: '#6b7280' }}>
          STRATEGY COMPARISON — {data.ticker}
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={rows} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid stroke="#1e1e2e" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatDate}
              tick={{ fontFamily: 'monospace', fontSize: 10, fill: '#6b7280' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontFamily: 'monospace', fontSize: 10, fill: '#6b7280' }}
              tickLine={false}
              axisLine={false}
              width={70}
              tickFormatter={v => `$${v.toLocaleString()}`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#111118', border: '1px solid #1e1e2e', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }}
              labelStyle={{ color: '#6b7280' }}
              labelFormatter={formatDate}
              formatter={(value, name) => [`$${value.toLocaleString()}`, name]}
            />
            <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: '11px' }} />
            <Line
              type="monotone"
              dataKey="buyHold"
              name="BUY & HOLD"
              stroke="#6b7280"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            {data.strategies.map(s => (
              s.equity_curve.length > 0 && (
                <Line
                  key={s.strategy}
                  type="monotone"
                  dataKey={s.strategy}
                  name={STRATEGY_META[s.strategy].label}
                  stroke={STRATEGY_META[s.strategy].color}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded p-4 mb-4" style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e' }}>
        <p className="font-mono text-xs mb-4 tracking-widest" style={{ color: '#6b7280' }}>RANKED RESULTS</p>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#6b7280', textAlign: 'right' }}>
                <th className="py-2 pr-4" style={{ textAlign: 'left' }}>STRATEGY</th>
                <th className="py-2 px-3">RETURN</th>
                <th className="py-2 px-3">CAGR</th>
                <th className="py-2 px-3">SHARPE</th>
                <th className="py-2 px-3">WIN RATE</th>
                <th className="py-2 px-3">MAX DD</th>
                <th className="py-2 pl-3">TRADES</th>
              </tr>
            </thead>
            <tbody style={{ textAlign: 'right' }}>
              {ranked.map(s => (
                <tr key={s.strategy} style={{ borderTop: '1px solid #1e1e2e' }}>
                  <td className="py-2 pr-4" style={{ textAlign: 'left', color: STRATEGY_META[s.strategy].color }}>
                    {STRATEGY_META[s.strategy].label}
                  </td>
                  <td className="py-2 px-3" style={{ color: s.total_return_pct == null ? '#6b7280' : s.total_return_pct > 0 ? '#00c896' : '#ff4d6d' }}>
                    {s.total_return_pct == null ? 'NO TRADES' : fmtPct(s.total_return_pct)}
                  </td>
                  <td className="py-2 px-3" style={{ color: '#e2e2e2' }}>{fmtPct(s.cagr_pct)}</td>
                  <td className="py-2 px-3" style={{ color: sharpeColor(s.sharpe) }}>{s.sharpe == null ? '—' : s.sharpe.toFixed(2)}</td>
                  <td className="py-2 px-3" style={{ color: '#e2e2e2' }}>{s.win_rate_pct == null ? '—' : `${s.win_rate_pct}%`}</td>
                  <td className="py-2 px-3" style={{ color: '#ff4d6d' }}>{s.max_drawdown_pct == null ? '—' : `${s.max_drawdown_pct}%`}</td>
                  <td className="py-2 pl-3" style={{ color: '#e2e2e2' }}>{s.num_trades ?? '—'}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid #1e1e2e' }}>
                <td className="py-2 pr-4" style={{ textAlign: 'left', color: '#6b7280' }}>BUY &amp; HOLD</td>
                <td className="py-2 px-3" style={{ color: data.buy_hold_return_pct > 0 ? '#00c896' : '#ff4d6d' }}>
                  {fmtPct(data.buy_hold_return_pct)}
                </td>
                <td className="py-2 px-3" style={{ color: '#6b7280' }}>—</td>
                <td className="py-2 px-3" style={{ color: '#6b7280' }}>—</td>
                <td className="py-2 px-3" style={{ color: '#6b7280' }}>—</td>
                <td className="py-2 px-3" style={{ color: '#6b7280' }}>—</td>
                <td className="py-2 pl-3" style={{ color: '#6b7280' }}>—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
