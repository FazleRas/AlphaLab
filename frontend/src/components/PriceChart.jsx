import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, BarChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceDot, ReferenceArea } from 'recharts';
import API from '../config';
import {
  SERIES,
  makeDateFormatter,
  legendDataKey,
  legendWrapperStyle,
  legendLabelStyle,
  Swatch,
  tooltipBoxStyle,
} from '../chartTheme';

// dataKey -> how the series is drawn. Close is the subject of the chart, the
// moving averages are overlays, so they read as grays behind it.
const LINES = [
  { key: 'close', label: 'CLOSE', color: SERIES.primary, width: 1.5, dash: null },
  { key: 'sma_20', label: 'SMA20', color: SERIES.overlay1, width: 1, dash: '4 4' },
  { key: 'sma_50', label: 'SMA50', color: SERIES.overlay2, width: 1, dash: '2 3' },
];

const LABEL_STYLE = { fontSize: '10.5px', letterSpacing: '0.16em', color: 'var(--color-muted)' };

// Recharts clones this with active/payload/label, so `first` and `formatDate`
// stay as passed.
const PriceTooltip = ({ active, payload, label, first, formatDate }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={tooltipBoxStyle}>
      <p style={{ ...LABEL_STYLE, margin: '0 0 6px' }}>{formatDate(label)}</p>
      {payload.map(entry => {
        const meta = LINES.find(l => l.key === entry.dataKey);
        const pct = entry.dataKey === 'close' && first
          ? ((entry.value - first) / first) * 100
          : null;
        return (
          <div
            key={entry.dataKey}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18 }}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <Swatch color={meta ? meta.color : entry.color} />
              <span style={LABEL_STYLE}>{meta ? meta.label : entry.name}</span>
            </span>
            <span>
              ${entry.value}
              {pct != null && (
                <span style={{ color: 'var(--color-muted)' }}>
                  {' '}({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default function PriceChart({ ticker }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [period, setPeriod] = useState('3mo');
    const [chartType, setChartType] = useState('line');
    const [measure, setMeasure] = useState({ a: null, b: null });
    // Series hidden via the legend. Click an entry to drop it and click again
    // to bring it back.
    const [hidden, setHidden] = useState({});

  const toggleSeries = (entry, _index, event) => {
    // Recharts renders the legend inside the chart wrapper, so a legend click
    // also reaches LineChart's onClick and would drop a measurement mark.
    event?.stopPropagation?.();
    const key = legendDataKey(entry);
    if (!key) return;
    setHidden(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const formatDate = useMemo(
    () => makeDateFormatter(data.map(d => d.date)),
    [data]
  );

  const renderLegendLabel = (value, entry) => {
    const key = legendDataKey(entry);
    return <span style={legendLabelStyle(!!hidden[key])}>{value}</span>;
  };

  // Click two points on the chart to measure the move between them. Recharts v3
  // gives us activeLabel (the date) on click, not the data point, so we look the
  // close up from the loaded series.
  const handleChartClick = (e, event) => {
    // Belt and braces with the legend's own stopPropagation: whichever way the
    // click arrives, one that started in the legend is a series toggle, not a
    // measurement pick.
    if (event?.target?.closest?.('.recharts-legend-wrapper')) return;
    if (!e || e.activeLabel == null) return;
    const idx = e.activeIndex ?? e.activeTooltipIndex;
    const row = (idx != null && data[idx]) || data.find(d => d.date === e.activeLabel);
    if (!row) return;
    const point = { date: e.activeLabel, close: row.close };
    setMeasure(prev => (!prev.a || prev.b ? { a: point, b: null } : { ...prev, b: point }));
  };

  const measureRefs = () => {
    const els = [];
    if (measure.a) els.push(<ReferenceDot key="a" x={measure.a.date} y={measure.a.close} r={4} fill="var(--color-accent)" stroke="var(--color-bg)" ifOverflow="visible" />);
    if (measure.b) {
      els.push(<ReferenceArea key="area" x1={measure.a.date} x2={measure.b.date} fill="var(--color-accent)" fillOpacity={0.08} ifOverflow="visible" />);
      els.push(<ReferenceDot key="b" x={measure.b.date} y={measure.b.close} r={4} fill="var(--color-accent)" stroke="var(--color-bg)" ifOverflow="visible" />);
    }
    return els;
  };

  const delta = measure.a && measure.b ? {
    pct: (measure.b.close - measure.a.close) / measure.a.close * 100,
    abs: measure.b.close - measure.a.close,
    days: Math.round((new Date(measure.b.date) - new Date(measure.a.date)) / 86400000),
  } : null;

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setMeasure({ a: null, b: null });
    fetch(`${API}/indicators/${ticker}?period=${period}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        setData(d.indicators || []);
        setLoading(false);
      })
      .catch(() => {
        setData([]);
        setError('Failed to load chart data.');
        setLoading(false);
      });
  }, [ticker, period]);

  const periods = ['1mo', '3mo', '6mo', '1y', '5y', 'max'];

  if (!ticker) return null;

return (
  <div className="p-4 mt-4" style={{ border: '1px solid var(--color-divider)' }}>
    <div className="flex items-center justify-between mb-4">
      <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-muted)' }}>{ticker} CHART</p>
      <div className="flex items-center gap-2">
        {periods.map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`chip${period === p ? ' chip--on' : ''}`}
          >
            {p.toUpperCase()}
          </button>
        ))}
        <div className="flex gap-2 ml-2" style={{ borderLeft: '1px solid var(--color-divider)', paddingLeft: '8px' }}>
          {['line', 'bar'].map(type => (
            <button
              key={type}
              onClick={() => setChartType(type)}
              className={`chip${chartType === type ? ' chip--on' : ''}`}
            >
              {type.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>

    {!loading && !error && (
      <div className="flex items-center gap-4 mb-3 font-mono text-xs flex-wrap">
        {!measure.a ? (
          <span style={{ color: 'var(--color-muted)' }}>Tip: click two points to measure the move between them.</span>
        ) : (
          <>
            <span style={{ color: 'var(--color-accent)' }}>A {measure.a.date} ${measure.a.close}</span>
            {measure.b && <span style={{ color: 'var(--color-accent)' }}>B {measure.b.date} ${measure.b.close}</span>}
            {delta && (
              <span style={{ color: delta.abs >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}>
                {delta.abs >= 0 ? '+' : ''}{delta.pct.toFixed(2)}% ({delta.abs >= 0 ? '+' : ''}${delta.abs.toFixed(2)}) · {delta.days}d
              </span>
            )}
            <button
              onClick={() => setMeasure({ a: null, b: null })}
              className="px-2 py-0.5"
              style={{ border: '1px solid var(--color-divider)', color: 'var(--color-muted)' }}
            >
              CLEAR
            </button>
          </>
        )}
      </div>
    )}

      {loading ? (
        <p className="font-mono text-xs" style={{ color: 'var(--color-muted)' }}>LOADING...</p>
      ) : error ? (
        <p className="font-mono text-xs" style={{ color: 'var(--color-neg)' }}>{error}</p>
      ) : (
        <>
        {chartType === 'line' ? (
        <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }} onClick={handleChartClick} style={{ cursor: 'crosshair' }}>
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontFamily: 'monospace', fontSize: 10, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontFamily: 'monospace', fontSize: 10, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={60} tickFormatter={v => `$${v}`} />
            <Tooltip content={<PriceTooltip first={data[0]?.close} formatDate={formatDate} />} />
            <Legend
              iconType="square"
              onClick={toggleSeries}
              formatter={renderLegendLabel}
              wrapperStyle={legendWrapperStyle}
            />
            {LINES.map(({ key, label, color, width, dash }) => (
              <Line
                key={key}
                type="linear"
                dataKey={key}
                name={label}
                stroke={color}
                strokeWidth={width}
                strokeDasharray={dash || undefined}
                dot={false}
                legendType="square"
                hide={!!hidden[key]}
                isAnimationActive={false}
              />
            ))}
            {measureRefs()}
            </LineChart>
        </ResponsiveContainer>
        ) : (
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }} onClick={handleChartClick} style={{ cursor: 'crosshair' }}>
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontFamily: 'monospace', fontSize: 10, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontFamily: 'monospace', fontSize: 10, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={60} tickFormatter={v => `$${v}`} />
            <Tooltip content={<PriceTooltip first={data[0]?.close} formatDate={formatDate} />} />
            <Legend iconType="square" wrapperStyle={legendWrapperStyle} />
            <Bar dataKey="close" fill={SERIES.primary} name="CLOSE" legendType="square" />
            {measureRefs()}
            </BarChart>
        </ResponsiveContainer>
        )}
        </>
      )}
    </div>
  );
}