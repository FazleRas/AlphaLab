import { useState, useMemo } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import {
  SERIES,
  makeDateFormatter,
  legendDataKey,
  legendWrapperStyle,
  legendLabelStyle,
  Swatch,
  tooltipBoxStyle,
} from '../chartTheme';

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

const fmt = (v) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const LABEL_STYLE = { fontSize: '10.5px', letterSpacing: '0.16em', color: 'var(--color-muted)' };

// Strategy equity is the subject of the chart; the benchmarks exist to compare
// against it, so they read as grays rather than colors of their own.
const SERIES_META = {
  equity: { label: 'STRATEGY', color: SERIES.primary },
  buyHold: { label: 'BUY & HOLD', color: SERIES.overlay1 },
  spy: { label: 'SPY', color: SERIES.overlay2 },
};

const Row = ({ label, color, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
    <span style={{ display: 'flex', alignItems: 'center' }}>
      <Swatch color={color} />
      <span style={LABEL_STYLE}>{label}</span>
    </span>
    <span style={{ color: 'var(--color-text)' }}>{children}</span>
  </div>
);

// Custom tooltip: shows each series' dollar value plus the strategy's margin
// over buy & hold ("the actual prices and a margin so you can compare").
const ChartTooltip = ({ active, payload, formatDate, hidden }) => {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  const margin = p.buyHold != null ? p.equity - p.buyHold : null;
  return (
    <div style={tooltipBoxStyle}>
      <p style={{ ...LABEL_STYLE, margin: '0 0 6px' }}>{formatDate(p.time)}</p>
      {!hidden.equity && (
        <Row label={SERIES_META.equity.label} color={SERIES_META.equity.color}>
          {fmt(p.equity)}{' '}
          <span style={{ color: 'var(--color-muted)' }}>({p.drawdownPct.toFixed(1)}% dd)</span>
        </Row>
      )}
      {p.buyHold != null && !hidden.buyHold && (
        <Row label={SERIES_META.buyHold.label} color={SERIES_META.buyHold.color}>{fmt(p.buyHold)}</Row>
      )}
      {p.spy != null && !hidden.spy && (
        <Row label={SERIES_META.spy.label} color={SERIES_META.spy.color}>{fmt(p.spy)}</Row>
      )}
      {margin != null && !hidden.equity && !hidden.buyHold && (
        <Row label="MARGIN" color="transparent">
          <span style={{ color: margin >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}>
            {margin >= 0 ? '+' : ''}{fmt(margin)}
          </span>
        </Row>
      )}
    </div>
  );
};

export default function EquityCurveChart({ data, benchmark, spy }) {
  // Series hidden via the legend; click an entry to drop it, click again to
  // bring it back. Declared before the early return so hook order is stable.
  const [hidden, setHidden] = useState({});

  const chartData = useMemo(
    () => buildChartData(data || [], benchmark, spy),
    [data, benchmark, spy]
  );
  const formatDate = useMemo(
    () => makeDateFormatter(chartData.map(p => p.time)),
    [chartData]
  );

  if (!data || data.length === 0) return null;

  const hasBenchmark = chartData.some(p => p.buyHold != null);
  const hasSpy = chartData.some(p => p.spy != null);

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
    <div className="p-4 mb-4" style={{ border: '1px solid var(--color-divider)' }}>
      <p className="font-mono text-xs mb-4 tracking-widest" style={{ color: 'var(--color-muted)' }}>EQUITY CURVE</p>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
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
          <Tooltip content={<ChartTooltip formatDate={formatDate} hidden={hidden} />} />
          <Legend
            iconType="square"
            onClick={toggleSeries}
            formatter={renderLegendLabel}
            wrapperStyle={legendWrapperStyle}
          />
          <Area
            type="linear"
            dataKey="equity"
            name={SERIES_META.equity.label}
            stackId="equity"
            stroke={SERIES_META.equity.color}
            fill={SERIES_META.equity.color}
            fillOpacity={0.1}
            strokeWidth={1.5}
            legendType="square"
            hide={!!hidden.equity}
            isAnimationActive={false}
          />
          <Area
            type="linear"
            dataKey="underwater"
            stackId="equity"
            stroke="none"
            fill={SERIES.negative}
            fillOpacity={0.15}
            isAnimationActive={false}
            legendType="none"
            tooltipType="none"
            /* Stacked on top of equity, so it has to disappear with it or it
               would float on a baseline that is no longer drawn. */
            hide={!!hidden.equity}
          />
          {hasBenchmark && (
            <Line
              type="linear"
              dataKey="buyHold"
              name={SERIES_META.buyHold.label}
              stroke={SERIES_META.buyHold.color}
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              legendType="square"
              hide={!!hidden.buyHold}
              isAnimationActive={false}
            />
          )}
          {hasSpy && (
            <Line
              type="linear"
              dataKey="spy"
              name={SERIES_META.spy.label}
              stroke={SERIES_META.spy.color}
              strokeWidth={1}
              strokeDasharray="2 3"
              dot={false}
              legendType="square"
              hide={!!hidden.spy}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
