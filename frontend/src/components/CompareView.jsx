import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import {
  SERIES,
  PEER_SERIES,
  makeDateFormatter,
  legendDataKey,
  legendWrapperStyle,
  legendLabelStyle,
} from '../chartTheme';

const STRATEGY_META = {
  rsi: { label: 'RSI', color: PEER_SERIES.rsi },
  macd: { label: 'MACD', color: PEER_SERIES.macd },
  combined: { label: 'RSI + MACD', color: PEER_SERIES.combined },
  golden_cross: { label: 'GOLDEN CROSS', color: PEER_SERIES.golden_cross },
};

const sharpeColor = (s) => {
  if (s == null) return 'var(--color-muted)';
  if (s < 0) return 'var(--color-neg)';
  if (s < 1) return 'var(--color-accent)';
  if (s < 2) return 'var(--color-text)';
  return 'var(--color-pos)';
};

const fmtPct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`);

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
  // Declared before the early return so hook order stays stable.
  const [hidden, setHidden] = useState({});

  const rows = useMemo(() => (data && data.strategies ? buildRows(data) : []), [data]);
  const formatDate = useMemo(() => makeDateFormatter(rows.map(r => r.time)), [rows]);

  if (!data || !data.strategies) return null;

  const ranked = [...data.strategies].sort(
    (a, b) => (b.total_return_pct ?? -Infinity) - (a.total_return_pct ?? -Infinity)
  );

  const toggleSeries = (entry) => {
    const key = legendDataKey(entry);
    if (!key) return;
    setHidden(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const renderLegendLabel = (value, entry) => {
    const key = legendDataKey(entry);
    return <span style={legendLabelStyle(!!hidden[key])}>{value}</span>;
  };

  return (
    <>
      <div className="p-4 mb-4" style={{ border: '1px solid var(--color-divider)' }}>
        <p className="font-mono text-xs mb-4 tracking-widest" style={{ color: 'var(--color-muted)' }}>
          STRATEGY COMPARISON — {data.ticker}
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={rows} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid stroke="var(--color-divider)" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatDate}
              tick={{ fontFamily: 'monospace', fontSize: 10, fill: 'var(--color-muted)' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontFamily: 'monospace', fontSize: 10, fill: 'var(--color-muted)' }}
              tickLine={false}
              axisLine={false}
              width={70}
              tickFormatter={v => `$${v.toLocaleString()}`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-divider)', fontFamily: 'inherit', fontSize: '12.5px' }}
              labelStyle={{ color: 'var(--color-muted)' }}
              labelFormatter={formatDate}
              formatter={(value, name) => [`$${value.toLocaleString()}`, name]}
            />
            <Legend
              iconType="square"
              onClick={toggleSeries}
              formatter={renderLegendLabel}
              wrapperStyle={legendWrapperStyle}
            />
            <Line
              type="linear"
              dataKey="buyHold"
              name="BUY & HOLD"
              stroke={SERIES.overlay1}
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              connectNulls
              legendType="square"
              hide={!!hidden.buyHold}
              isAnimationActive={false}
            />
            {/* Unlike the other charts, the strategies here are peers being
                compared against each other rather than overlays on one subject,
                so they keep distinct colors. Only the benchmark is grayed. */}
            {data.strategies.map(s => (
              s.equity_curve.length > 0 && (
                <Line
                  key={s.strategy}
                  type="linear"
                  dataKey={s.strategy}
                  name={STRATEGY_META[s.strategy].label}
                  stroke={STRATEGY_META[s.strategy].color}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                  legendType="square"
                  hide={!!hidden[s.strategy]}
                  isAnimationActive={false}
                />
              )
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="p-4 mb-4" style={{ border: '1px solid var(--color-divider)' }}>
        <p className="font-mono text-xs mb-4 tracking-widest" style={{ color: 'var(--color-muted)' }}>RANKED RESULTS</p>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--color-muted)', textAlign: 'right' }}>
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
                <tr key={s.strategy} style={{ borderTop: '1px solid var(--color-hairline)' }}>
                  <td className="py-2 pr-4" style={{ textAlign: 'left', color: STRATEGY_META[s.strategy].color }}>
                    {STRATEGY_META[s.strategy].label}
                  </td>
                  <td className="py-2 px-3" style={{ color: s.total_return_pct == null ? 'var(--color-muted)' : s.total_return_pct > 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}>
                    {s.total_return_pct == null ? 'NO TRADES' : fmtPct(s.total_return_pct)}
                  </td>
                  <td className="py-2 px-3" style={{ color: 'var(--color-text)' }}>{fmtPct(s.cagr_pct)}</td>
                  <td className="py-2 px-3" style={{ color: sharpeColor(s.sharpe) }}>{s.sharpe == null ? '—' : s.sharpe.toFixed(2)}</td>
                  <td className="py-2 px-3" style={{ color: 'var(--color-text)' }}>{s.win_rate_pct == null ? '—' : `${s.win_rate_pct}%`}</td>
                  <td className="py-2 px-3" style={{ color: 'var(--color-neg)' }}>{s.max_drawdown_pct == null ? '—' : `${s.max_drawdown_pct}%`}</td>
                  <td className="py-2 pl-3" style={{ color: 'var(--color-text)' }}>{s.num_trades ?? '—'}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--color-hairline)' }}>
                <td className="py-2 pr-4" style={{ textAlign: 'left', color: 'var(--color-muted)' }}>BUY &amp; HOLD</td>
                <td className="py-2 px-3" style={{ color: data.buy_hold_return_pct > 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}>
                  {fmtPct(data.buy_hold_return_pct)}
                </td>
                <td className="py-2 px-3" style={{ color: 'var(--color-muted)' }}>—</td>
                <td className="py-2 px-3" style={{ color: 'var(--color-muted)' }}>—</td>
                <td className="py-2 px-3" style={{ color: 'var(--color-muted)' }}>—</td>
                <td className="py-2 px-3" style={{ color: 'var(--color-muted)' }}>—</td>
                <td className="py-2 pl-3" style={{ color: 'var(--color-muted)' }}>—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
