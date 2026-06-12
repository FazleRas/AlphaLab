import { ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const withDrawdown = (data) => {
  let peak = -Infinity;
  return data.map(point => {
    peak = Math.max(peak, point.equity);
    return {
      ...point,
      time: new Date(point.timestamp).getTime(),
      underwater: peak - point.equity,
      drawdownPct: peak > 0 ? ((point.equity - peak) / peak) * 100 : 0,
    };
  });
};

const formatDate = (time) => new Date(time).toLocaleDateString();

export default function EquityCurveChart({ data }) {
  if (!data || data.length === 0) return null;

  const chartData = withDrawdown(data);

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
          <Tooltip
            contentStyle={{ backgroundColor: '#111118', border: '1px solid #1e1e2e', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }}
            labelStyle={{ color: '#6b7280' }}
            labelFormatter={formatDate}
            formatter={(value, name, { payload }) => {
              if (name === 'equity') return [`$${value.toLocaleString()} (${payload.drawdownPct.toFixed(2)}% dd)`, 'EQUITY'];
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="equity"
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
            tooltipType="none"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
