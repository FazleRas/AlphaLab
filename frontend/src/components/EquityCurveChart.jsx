import { useState, useMemo } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceArea, ReferenceDot,
} from 'recharts';
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

// Trade dates are plain "YYYY-MM-DD"; curve timestamps are UTC midnight.
const toTime = (d) => (d ? Date.parse(`${d}T00:00:00Z`) : NaN);

// The equity curve only has a point where equity changed (the start and each
// sell), so a trade date usually falls between points. Read the equity off
// the straight segment the chart draws between them, so the marker sits on
// the line at the trade's real date.
const equityAt = (chartData, t) => {
  if (!chartData.length || Number.isNaN(t)) return null;
  if (t <= chartData[0].time) return chartData[0].equity;
  const last = chartData[chartData.length - 1];
  if (t >= last.time) return last.equity;
  let lo = 0;
  let hi = chartData.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (chartData[mid].time < t) lo = mid + 1; else hi = mid;
  }
  const b = chartData[lo];
  const a = chartData[lo - 1];
  if (!a || b.time === a.time) return b.equity;
  const u = (t - a.time) / (b.time - a.time);
  return a.equity + (b.equity - a.equity) * u;
};

const buildMarkers = (chartData, trades) => {
  const buys = [];
  const sells = [];
  const spans = [];
  (trades || []).forEach((tr, i) => {
    const bt = toTime(tr.buy_date);
    const st = toTime(tr.sell_date);
    const be = equityAt(chartData, bt);
    const se = equityAt(chartData, st);
    if (be != null) buys.push({ i, time: bt, equity: be });
    if (se != null) sells.push({ i, time: st, equity: se });
    if (be != null && se != null) spans.push({ i, x1: bt, x2: st, win: !!tr.win });
  });
  return { buys, sells, spans };
};

// Buy sits under the line pointing up; sell sits above pointing down.
const Marker = ({ cx, cy, up, delay }) => {
  if (cx == null || cy == null) return null;
  const d = up
    ? `M${cx} ${cy + 4} L${cx - 4.5} ${cy + 12} L${cx + 4.5} ${cy + 12} Z`
    : `M${cx} ${cy - 4} L${cx - 4.5} ${cy - 12} L${cx + 4.5} ${cy - 12} Z`;
  return (
    <path
      d={d}
      className="marker-in"
      style={{ animationDelay: `${delay}ms` }}
      fill={up ? 'var(--color-pos)' : 'var(--color-neg)'}
      stroke="var(--color-bg)"
      strokeWidth={1}
    />
  );
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

const ANIM = { isAnimationActive: true, animationDuration: 800, animationEasing: 'ease-out' };

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

const DrawdownTooltip = ({ active, payload, formatDate }) => {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div style={tooltipBoxStyle}>
      <p style={{ ...LABEL_STYLE, margin: '0 0 6px' }}>{formatDate(p.time)}</p>
      <Row label="DRAWDOWN" color={SERIES.negative}>
        <span style={{ color: p.drawdownPct < 0 ? 'var(--color-neg)' : 'var(--color-muted)' }}>
          {p.drawdownPct.toFixed(2)}%
        </span>
      </Row>
    </div>
  );
};

const AXIS_TICK = { fontFamily: 'monospace', fontSize: 10, fill: 'var(--color-muted)' };
const Y_WIDTH = 70;

/**
 * Strategy equity against its benchmarks, with every trade drawn on the
 * curve (buy/sell markers, shaded while in the market) and a drawdown strip
 * underneath that shares the hover cursor.
 *
 * `activeTrade` is the index of a trade the user is pointing at elsewhere
 * (the trade list); its span is lit and the rest step back.
 */
export default function EquityCurveChart({ data, benchmark, spy, trades, activeTrade }) {
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
  const markers = useMemo(() => buildMarkers(chartData, trades), [chartData, trades]);

  if (!data || data.length === 0) return null;

  const hasBenchmark = chartData.some(p => p.buyHold != null);
  const hasSpy = chartData.some(p => p.spy != null);
  const hasTrades = markers.spans.length > 0;
  const minDd = Math.min(-1, ...chartData.map(p => p.drawdownPct));

  const toggleSeries = (entry) => {
    const key = legendDataKey(entry);
    if (!key) return;
    setHidden(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const renderLegendLabel = (value, entry) => {
    const key = legendDataKey(entry);
    return <span style={legendLabelStyle(!!hidden[key])}>{value}</span>;
  };

  const spanOpacity = (i) => {
    if (activeTrade == null) return 0.07;
    return i === activeTrade ? 0.22 : 0.03;
  };

  return (
    <div className="p-4 mb-4" style={{ border: '1px solid var(--color-divider)' }}>
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-muted)' }}>EQUITY CURVE</p>
        {hasTrades && (
          <p className="font-mono text-xs flex gap-4" style={LABEL_STYLE}>
            <span><span style={{ color: 'var(--color-pos)' }}>▲</span> BUY</span>
            <span><span style={{ color: 'var(--color-neg)' }}>▼</span> SELL</span>
            <span>SHADED · IN MARKET</span>
          </p>
        )}
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} syncId="equity" margin={{ top: 12, right: 5, bottom: 5, left: 0 }}>
          <CartesianGrid stroke="var(--color-divider)" vertical={false} />
          <XAxis
            dataKey="time"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatDate}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={Y_WIDTH}
            tickFormatter={v => `$${v.toLocaleString()}`}
          />
          <Tooltip content={<ChartTooltip formatDate={formatDate} hidden={hidden} />} />
          <Legend
            iconType="square"
            onClick={toggleSeries}
            formatter={renderLegendLabel}
            wrapperStyle={legendWrapperStyle}
          />
          {/* In-market spans go first so lines and markers paint over them. */}
          {markers.spans.map(s => (
            <ReferenceArea
              key={`span${s.i}`}
              x1={s.x1}
              x2={s.x2}
              fill={s.win ? 'var(--color-pos)' : 'var(--color-neg)'}
              fillOpacity={spanOpacity(s.i)}
              stroke="none"
              ifOverflow="visible"
            />
          ))}
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
            {...ANIM}
          />
          <Area
            type="linear"
            dataKey="underwater"
            stackId="equity"
            stroke="none"
            fill={SERIES.negative}
            fillOpacity={0.15}
            legendType="none"
            tooltipType="none"
            /* Stacked on top of equity, so it has to disappear with it or it
               would float on a baseline that is no longer drawn. */
            hide={!!hidden.equity}
            {...ANIM}
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
              {...ANIM}
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
              {...ANIM}
            />
          )}
          {!hidden.equity && markers.buys.map(m => (
            <ReferenceDot
              key={`buy${m.i}`}
              x={m.time}
              y={m.equity}
              ifOverflow="visible"
              shape={props => <Marker {...props} up delay={700 + m.i * 40} />}
            />
          ))}
          {!hidden.equity && markers.sells.map(m => (
            <ReferenceDot
              key={`sell${m.i}`}
              x={m.time}
              y={m.equity}
              ifOverflow="visible"
              shape={props => <Marker {...props} up={false} delay={720 + m.i * 40} />}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Drawdown strip: same x range and axis width, so it lines up with the
          curve above and shares its hover cursor via syncId. */}
      <p className="font-mono text-xs tracking-widest mt-3 mb-1" style={{ color: 'var(--color-muted)' }}>DRAWDOWN</p>
      <ResponsiveContainer width="100%" height={90}>
        <ComposedChart data={chartData} syncId="equity" margin={{ top: 2, right: 5, bottom: 0, left: 0 }}>
          <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} hide />
          <YAxis
            domain={[minDd, 0]}
            ticks={[Math.floor(minDd), 0]}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={Y_WIDTH}
            tickFormatter={v => `${v}%`}
          />
          <Tooltip content={<DrawdownTooltip formatDate={formatDate} />} cursor={{ stroke: 'var(--color-divider)' }} />
          <Area
            type="linear"
            dataKey="drawdownPct"
            stroke={SERIES.negative}
            strokeWidth={1}
            fill={SERIES.negative}
            fillOpacity={0.25}
            baseValue={0}
            {...ANIM}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
