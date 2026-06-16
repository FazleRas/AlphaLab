import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

const buildChartData = (data, benchmark, spy) => {
  const benchByTime = new Map((benchmark || []).map(p => [p.timestamp, p.equity]));
  const spyByTime = new Map((spy || []).map(p => [p.timestamp, p.equity]));
  let peak = -Infinity;
  return data.map(point => {
    peak = Math.max(peak, point.equity);
    return {
      ...point,
      time: new Date(point.timestamp).getTime(),
      underwater: peak - point.equity,
      drawdownPct: peak > 0 ? ((point.equity - peak) / peak) * 100 : 0,
      buyHold: benchByTime.get(point.timestamp),
      spy: spyByTime.get(point.timestamp),
    };
  });
};

const formatDate = (time) => new Date(time).toLocaleDateString();
const fmt = (v) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const Row = ({ label, color, children }) => (
  <div className="flex items-center justify-between gap-6">
    <span style={{ color }}>{label}</span>
    <span style={{ color: '#e2e2e2' }}>{children}</span>
  </div>
);

// Custom tooltip: shows each series' dollar value plus the strategy's margin
// over buy & hold ("the actual prices and a margin so you can compare").
const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  const margin = p.buyHold != null ? p.equity - p.buyHold : null;
  return (
    <div className="font-mono" style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e', borderRadius: 4, padding: '8px 10px', fontSize: 12 }}>
      <p className="mb-1" style={{ color: '#6b7280' }}>{formatDate(p.time)}</p>
      <Row label="STRATEGY" color="#2563eb">{fmt(p.equity)} <span style={{ color: '#6b7280' }}>({p.drawdownPct.toFixed(1)}% dd)</span></Row>
      {p.buyHold != null && <Row label="BUY & HOLD" color="#6b7280">{fmt(p.buyHold)}</Row>}
      {p.spy != null && <Row label="SPY" color="#f97316">{fmt(p.spy)}</Row>}
      {margin != null && (
        <Row label="MARGIN" color="#6b7280">
          <span style={{ color: margin >= 0 ? '#00c896' : '#ff4d6d' }}>
            {margin >= 0 ? '+' : ''}{fmt(margin)}
          </span>
        </Row>
      )}
    </div>
  );
};

export default function EquityCurveChart({ data, benchmark, spy }) {
  if (!data || data.length === 0) return null;

  const chartData = buildChartData(data, benchmark, spy);
  const hasBenchmark = chartData.some(p => p.buyHold != null);
  const hasSpy = chartData.some(p => p.spy != null);

  return (
    <div className="rounded p-4 mb-4" style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e' }}>
      <p className="font-mono text-xs mb-4 tracking-widest" style={{ color: '#6b7280' }}>EQUITY CURVE</p>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
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
          <Tooltip content={<ChartTooltip />} />
          {(hasBenchmark || hasSpy) && <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: '11px' }} />}
          <Area
            type="monotone"
            dataKey="equity"
            name="STRATEGY"
            stackId="equity"
            stroke="#2563eb"
            fill="#2563eb"
            fillOpacity={0.1}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="underwater"
            stackId="equity"
            stroke="none"
            fill="#ff4d6d"
            fillOpacity={0.15}
            isAnimationActive={false}
            legendType="none"
            tooltipType="none"
          />
          {hasBenchmark && (
            <Line
              type="monotone"
              dataKey="buyHold"
              name="BUY & HOLD"
              stroke="#6b7280"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />
          )}
          {hasSpy && (
            <Line
              type="monotone"
              dataKey="spy"
              name="SPY"
              stroke="#f97316"
              strokeWidth={1}
              strokeDasharray="2 3"
              dot={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
