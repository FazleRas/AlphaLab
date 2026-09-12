import React, { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart, LineChart, BarChart, Line, Bar, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, ReferenceDot, ReferenceArea, ReferenceLine,
} from 'recharts';
import API from '../config';
import { ChartSkeleton } from './Skeleton';
import { inField } from '../nav';
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

const PERIODS = ['1mo', '3mo', '6mo', '1y', '5y', 'max'];
const PANES = [
  { key: 'vol', label: 'VOL' },
  { key: 'rsi', label: 'RSI' },
  { key: 'macd', label: 'MACD' },
];
const PREFS_KEY = 'alphalab:chart';
const SYNC = 'price';
const Y_WIDTH = 60;
const PANE_MARGIN = { top: 2, right: 5, bottom: 0, left: 0 };
const AXIS_TICK = { fontFamily: 'monospace', fontSize: 10, fill: 'var(--color-muted)' };
const LABEL_STYLE = { fontSize: '10.5px', letterSpacing: '0.16em', color: 'var(--color-muted)' };
const ANIM = { isAnimationActive: true, animationDuration: 800, animationEasing: 'ease-out' };

const fix = (v, d = 2) => (v == null ? '—' : Number(v).toFixed(d));
const compact = (v) => {
  if (v == null) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
};
const rsiColor = (v) => (v == null ? 'var(--color-muted)' : v > 70 ? 'var(--color-neg)' : v < 30 ? 'var(--color-pos)' : 'var(--color-text)');
const upDay = (row) => row.close >= (row.open ?? row.close);
const dirColor = (row) => (upDay(row) ? 'var(--color-pos)' : 'var(--color-neg)');

const CHART_TYPES = [
  { key: 'line', label: 'LINE' },
  { key: 'candles', label: 'CANDLES' },
  { key: 'spy', label: 'VS SPY' },
];

const readPrefs = () => {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return {
      chartType: CHART_TYPES.some(t => t.key === p.chartType) ? p.chartType : 'line',
      panes: { vol: true, rsi: true, macd: false, ...(p.panes || {}) },
    };
  } catch (e) {
    return { chartType: 'line', panes: { vol: true, rsi: true, macd: false } };
  }
};

// Indicators carry close/SMA/RSI/MACD per day; history carries OHLCV. Join
// them by date so one row feeds every pane. `range` is what the candle bar
// spans; a row without OHLC (history failed) gets no candle.
const merge = (indicators, history) => {
  const byDate = new Map((history || []).map(h => [h.date, h]));
  return (indicators || []).map(row => {
    const h = byDate.get(row.date);
    return h
      ? { ...row, open: h.open, high: h.high, low: h.low, volume: h.volume, range: [h.low, h.high] }
      : { ...row, range: null };
  });
};

// Relative strength: both series rebased to 100 at the first date they share,
// so the gap between the lines is the ticker's lead over the index.
const withRelative = (rows, spyRows) => {
  if (!spyRows || !spyRows.length) return rows;
  const spyByDate = new Map(spyRows.map(h => [h.date, h.close]));
  let base = null;
  return rows.map(row => {
    const spy = spyByDate.get(row.date);
    if (spy == null || row.close == null) return row;
    if (!base) base = { close: row.close, spy };
    return { ...row, rel: (row.close / base.close) * 100, spyRel: (spy / base.spy) * 100 };
  });
};

// Recharts hands the range bar's box (low..high) and the row; the body is
// open..close inside it, the wick is the full box.
const Candle = ({ x, y, width, height, payload }) => {
  if (!payload || payload.open == null || payload.high == null || payload.low == null || !height) return null;
  const { open, close, high, low } = payload;
  const px = height / ((high - low) || 1);
  const top = y + (high - Math.max(open, close)) * px;
  const bodyH = Math.max(1, Math.abs(open - close) * px);
  const color = dirColor(payload);
  const cx = x + width / 2;
  const w = Math.max(1, Math.min(width * 0.7, 9));
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={cx - w / 2} y={top} width={w} height={bodyH} fill={color} />
    </g>
  );
};

const Row = ({ label, color = 'transparent', children }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18 }}>
    <span style={{ display: 'flex', alignItems: 'center' }}>
      <Swatch color={color} />
      <span style={LABEL_STYLE}>{label}</span>
    </span>
    <span>{children}</span>
  </div>
);

const Muted = ({ children }) => <span style={{ color: 'var(--color-muted)' }}>{children}</span>;

// One tooltip for every pane: the panes render only a cursor line and lean on
// this, which reads the whole merged row.
const PriceTooltip = ({ active, payload, label, first, formatDate, chartType, panes, hidden, ticker }) => {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  const pct = first ? ((row.close - first) / first) * 100 : null;
  const pctText = pct == null ? null : `(${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
  const anyPane = panes.vol || panes.rsi || panes.macd;
  return (
    <div style={tooltipBoxStyle}>
      <p style={{ ...LABEL_STYLE, margin: '0 0 6px' }}>{formatDate(label)}</p>
      {chartType === 'spy' ? (
        <>
          <Row label={ticker} color={SERIES.primary}>{fix(row.rel, 1)} <Muted>({fix(row.close)})</Muted></Row>
          <Row label="SPY" color={SERIES.overlay1}>{fix(row.spyRel, 1)}</Row>
          {row.rel != null && row.spyRel != null && (
            <Row label="SPREAD">
              <span style={{ color: row.rel - row.spyRel >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}>
                {row.rel - row.spyRel >= 0 ? '+' : ''}{(row.rel - row.spyRel).toFixed(1)} PTS
              </span>
            </Row>
          )}
        </>
      ) : chartType === 'candles' && row.open != null ? (
        <>
          <Row label="OPEN">${fix(row.open)}</Row>
          <Row label="HIGH">${fix(row.high)}</Row>
          <Row label="LOW">${fix(row.low)}</Row>
          <Row label="CLOSE" color={dirColor(row)}>${fix(row.close)} <Muted>{pctText}</Muted></Row>
        </>
      ) : (
        !hidden.close && (
          <Row label="CLOSE" color={SERIES.primary}>${fix(row.close)} <Muted>{pctText}</Muted></Row>
        )
      )}
      {chartType !== 'spy' && !hidden.sma_20 && row.sma_20 != null && <Row label="SMA20" color={SERIES.overlay1}>${fix(row.sma_20)}</Row>}
      {chartType !== 'spy' && !hidden.sma_50 && row.sma_50 != null && <Row label="SMA50" color={SERIES.overlay2}>${fix(row.sma_50)}</Row>}
      {anyPane && <div style={{ borderTop: '1px solid var(--color-hairline)', margin: '6px 0' }} />}
      {panes.vol && row.volume != null && <Row label="VOL">{compact(row.volume)}</Row>}
      {panes.rsi && row.rsi != null && <Row label="RSI"><span style={{ color: rsiColor(row.rsi) }}>{fix(row.rsi)}</span></Row>}
      {panes.macd && row.macd != null && (
        <Row label="MACD">{fix(row.macd, 3)} <Muted>SIG {fix(row.macd_signal, 3)}</Muted></Row>
      )}
    </div>
  );
};

// Header readout for the row under the cursor (or the latest row), the way a
// terminal prints O/H/L/C above the chart.
const Readout = ({ row, chartType, ticker }) => {
  if (!row) return null;
  const V = ({ k, v, color }) => (
    <span style={{ marginRight: 14, whiteSpace: 'nowrap' }}>
      <span style={{ color: 'var(--color-muted)' }}>{k} </span>
      <span style={{ color: color || 'var(--color-text)' }}>{v}</span>
    </span>
  );
  if (chartType === 'spy') {
    const spread = row.rel != null && row.spyRel != null ? row.rel - row.spyRel : null;
    return (
      <span className="readout font-mono text-xs">
        <V k={ticker} v={fix(row.rel, 1)} /><V k="SPY" v={fix(row.spyRel, 1)} />
        {spread != null && <V k="SPREAD" v={`${spread >= 0 ? '+' : ''}${spread.toFixed(1)}`} color={spread >= 0 ? 'var(--color-pos)' : 'var(--color-neg)'} />}
        <V k="BASE" v="100 AT START" />
      </span>
    );
  }
  if (chartType === 'candles' && row.open != null) {
    const c = dirColor(row);
    return (
      <span className="readout font-mono text-xs">
        <V k="O" v={fix(row.open)} /><V k="H" v={fix(row.high)} /><V k="L" v={fix(row.low)} /><V k="C" v={fix(row.close)} color={c} />
        {row.volume != null && <V k="V" v={compact(row.volume)} />}
      </span>
    );
  }
  return (
    <span className="readout font-mono text-xs">
      <V k="C" v={fix(row.close)} />
      {row.sma_20 != null && <V k="SMA20" v={fix(row.sma_20)} />}
      {row.sma_50 != null && <V k="SMA50" v={fix(row.sma_50)} />}
      {row.rsi != null && <V k="RSI" v={fix(row.rsi)} color={rsiColor(row.rsi)} />}
    </span>
  );
};

const PaneLabel = ({ children }) => (
  <p className="font-mono text-xs tracking-widest mt-3 mb-1" style={{ color: 'var(--color-muted)' }}>{children}</p>
);

export default function PriceChart({ ticker }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('3mo');
  const [prefs, setPrefs] = useState(readPrefs);
  const [measure, setMeasure] = useState({ a: null, b: null });
  const [cursor, setCursor] = useState(null);
  // SPY closes for the same window, fetched only when the VS SPY mode is on.
  const [spy, setSpy] = useState({ period: null, rows: null });
  // Series hidden via the legend. Click an entry to drop it and click again
  // to bring it back.
  const [hidden, setHidden] = useState({});

  const { chartType, panes } = prefs;
  const updatePrefs = (patch) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch (e) { /* session only */ }
      return next;
    });
  };
  const togglePane = (key) => updatePrefs({ panes: { ...panes, [key]: !panes[key] } });

  const toggleSeries = (entry, _index, event) => {
    // Recharts renders the legend inside the chart wrapper, so a legend click
    // also reaches the chart's onClick and would drop a measurement mark.
    event?.stopPropagation?.();
    const key = legendDataKey(entry);
    if (!key) return;
    setHidden(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const formatDate = useMemo(() => makeDateFormatter(data.map(d => d.date)), [data]);

  const renderLegendLabel = (value, entry) => {
    const key = legendDataKey(entry);
    return <span style={legendLabelStyle(!!hidden[key])}>{value}</span>;
  };

  // Recharts v3 gives activeLabel (the date) and an index on chart events,
  // not the row, so it is looked up from the loaded series.
  const rowAt = (e) => {
    if (!e || e.activeLabel == null) return null;
    const idx = e.activeIndex ?? e.activeTooltipIndex;
    return (idx != null && rows[idx]) || rows.find(d => d.date === e.activeLabel) || null;
  };
  const handleMove = (e) => setCursor(rowAt(e));

  // Click two points on the chart to measure the move between them.
  const handleChartClick = (e, event) => {
    // Belt and braces with the legend's own stopPropagation: whichever way the
    // click arrives, one that started in the legend is a series toggle, not a
    // measurement pick.
    if (event?.target?.closest?.('.recharts-legend-wrapper')) return;
    if (chartType === 'spy') return; // the axis is an index here, not dollars
    const row = rowAt(e);
    if (!row) return;
    const point = { date: row.date, close: row.close };
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
    if (!ticker) return undefined;
    let live = true;
    setLoading(true);
    setError(null);
    setMeasure({ a: null, b: null });
    setCursor(null);
    const get = (path) => fetch(`${API}${path}`).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    // OHLCV is optional: if history fails the line chart still works and the
    // candle toggle is disabled.
    Promise.all([
      get(`/indicators/${ticker}?period=${period}`),
      get(`/history/${ticker}?period=${period}`).catch(() => null),
    ])
      .then(([ind, hist]) => {
        if (!live) return;
        setData(merge(ind.indicators, hist && hist.prices));
        setLoading(false);
      })
      .catch(() => {
        if (!live) return;
        setData([]);
        setError('Failed to load chart data.');
        setLoading(false);
      });
    return () => { live = false; };
  }, [ticker, period]);

  // VS SPY needs the index for the same window; cached per period.
  useEffect(() => {
    if (chartType !== 'spy' || !ticker || spy.period === period) return undefined;
    let live = true;
    fetch(`${API}/history/SPY?period=${period}`)
      .then(r => (r.ok ? r.json() : { prices: [] }))
      .then(d => { if (live) setSpy({ period, rows: d.prices || [] }); })
      .catch(() => { if (live) setSpy({ period, rows: [] }); });
    return () => { live = false; };
  }, [chartType, ticker, period, spy.period]);

  // Chart keys: arrows step the period, C flips line/candles. Ignored while
  // typing or while the palette is open.
  useEffect(() => {
    const onKey = (e) => {
      if (inField(e.target) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.palette')) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setPeriod(p => {
          const i = PERIODS.indexOf(p);
          return PERIODS[Math.min(PERIODS.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1)))];
        });
      } else if (e.key === 'c' || e.key === 'C') {
        setPrefs(prev => {
          const next = { ...prev, chartType: prev.chartType === 'candles' ? 'line' : 'candles' };
          try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch (err) { /* session only */ }
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!ticker) return null;

  const hasOhlc = data.some(r => r.open != null);
  const showCandles = chartType === 'candles' && hasOhlc;
  const showRel = chartType === 'spy';
  const mode = showRel ? 'spy' : showCandles ? 'candles' : 'line';
  const rows = showRel && spy.period === period ? withRelative(data, spy.rows) : data;
  const readoutRow = cursor || rows[rows.length - 1] || null;
  const first = data[0]?.close;
  // Candles need the axis to hug the price range; a bar's default domain
  // would drag it down to zero.
  const priceDomain = showCandles ? [(min) => min * 0.995, (max) => max * 1.005] : ['auto', 'auto'];
  const yTick = showRel ? (v) => Math.round(v) : (v) => `$${Math.round(v)}`;

  return (
    <div className="p-4 mt-4" style={{ border: '1px solid var(--color-divider)' }}>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-muted)' }}>{ticker} CHART</p>
        <div className="flex items-center gap-2 flex-wrap">
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`chip${period === p ? ' chip--on' : ''}`}>
              {p.toUpperCase()}
            </button>
          ))}
          <div className="flex gap-2 ml-2" style={{ borderLeft: '1px solid var(--color-divider)', paddingLeft: '8px' }}>
            {CHART_TYPES.map(t => {
              const disabled = (t.key === 'candles' && !loading && !hasOhlc) || (t.key === 'spy' && ticker === 'SPY');
              return (
                <button
                  key={t.key}
                  onClick={() => !disabled && updatePrefs({ chartType: t.key })}
                  disabled={disabled}
                  title={disabled ? (t.key === 'spy' ? 'SPY against itself' : 'No OHLC data for this range') : undefined}
                  className={`chip${chartType === t.key ? ' chip--on' : ''}`}
                  style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 ml-2" style={{ borderLeft: '1px solid var(--color-divider)', paddingLeft: '8px' }}>
            {PANES.map(p => (
              <button key={p.key} onClick={() => togglePane(p.key)} className={`chip${panes[p.key] ? ' chip--on' : ''}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!loading && !error && (
        <div className="flex items-center justify-between gap-4 mb-3 font-mono text-xs flex-wrap">
          <Readout row={readoutRow} chartType={mode} ticker={ticker} />
          {showRel ? (
            <span style={{ color: 'var(--color-muted)' }}>Both rebased to 100 at the start of the range.</span>
          ) : !measure.a ? (
            <span style={{ color: 'var(--color-muted)' }}>Click two points to measure the move between them.</span>
          ) : (
            <span className="flex items-center gap-4 flex-wrap">
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
            </span>
          )}
        </div>
      )}

      {loading ? (
        <ChartSkeleton height={300} label={false} bare />
      ) : error ? (
        <p className="font-mono text-xs" style={{ color: 'var(--color-neg)' }}>{error}</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart
              data={rows}
              syncId={SYNC}
              margin={{ top: 5, right: 5, bottom: 5, left: 0 }}
              onClick={handleChartClick}
              onMouseMove={handleMove}
              onMouseLeave={() => setCursor(null)}
              style={{ cursor: 'crosshair' }}
            >
              <XAxis dataKey="date" tickFormatter={formatDate} tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={40} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} domain={priceDomain} width={Y_WIDTH} tickFormatter={yTick} />
              <Tooltip
                content={<PriceTooltip first={first} formatDate={formatDate} chartType={mode} panes={panes} hidden={hidden} ticker={ticker} />}
              />
              <Legend iconType="square" onClick={toggleSeries} formatter={renderLegendLabel} wrapperStyle={legendWrapperStyle} />
              {showCandles && (
                <Bar dataKey="range" name="OHLC" legendType="none" tooltipType="none" isAnimationActive={false} maxBarSize={10} shape={<Candle />} />
              )}
              {showRel && (
                <>
                  <Line type="linear" dataKey="rel" name={ticker} stroke={SERIES.primary} strokeWidth={1.5} dot={false} legendType="square" connectNulls {...ANIM} />
                  <Line type="linear" dataKey="spyRel" name="SPY" stroke={SERIES.overlay1} strokeWidth={1} strokeDasharray="4 4" dot={false} legendType="square" connectNulls {...ANIM} />
                </>
              )}
              {!showRel && LINES.filter(l => !(showCandles && l.key === 'close')).map(({ key, label, color, width, dash }) => (
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
                  {...ANIM}
                />
              ))}
              {!showRel && measureRefs()}
            </ComposedChart>
          </ResponsiveContainer>

          {/* Panes share the x range and axis width, so they line up under the
              price chart and follow its crosshair via syncId. Each renders only
              a cursor; the values ride in the main tooltip. */}
          {panes.vol && hasOhlc && (
            <>
              <PaneLabel>VOLUME</PaneLabel>
              <ResponsiveContainer width="100%" height={70}>
                <BarChart data={data} syncId={SYNC} margin={PANE_MARGIN} onMouseMove={handleMove} onMouseLeave={() => setCursor(null)}>
                  <XAxis dataKey="date" hide />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={Y_WIDTH} tickFormatter={compact} tickCount={3} />
                  <Tooltip content={() => null} cursor={{ fill: 'var(--color-hairline)' }} />
                  <Bar dataKey="volume" isAnimationActive={false} maxBarSize={10}>
                    {data.map(row => <Cell key={row.date} fill={dirColor(row)} fillOpacity={0.55} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
          {panes.rsi && (
            <>
              <PaneLabel>RSI 14</PaneLabel>
              <ResponsiveContainer width="100%" height={90}>
                <LineChart data={data} syncId={SYNC} margin={PANE_MARGIN} onMouseMove={handleMove} onMouseLeave={() => setCursor(null)}>
                  <XAxis dataKey="date" hide />
                  <YAxis domain={[0, 100]} ticks={[30, 70]} tick={AXIS_TICK} tickLine={false} axisLine={false} width={Y_WIDTH} />
                  <ReferenceLine y={70} stroke="var(--color-neg)" strokeOpacity={0.45} strokeDasharray="3 3" />
                  <ReferenceLine y={30} stroke="var(--color-pos)" strokeOpacity={0.45} strokeDasharray="3 3" />
                  <Tooltip content={() => null} cursor={{ stroke: 'var(--color-divider)' }} />
                  <Line type="linear" dataKey="rsi" stroke={SERIES.primary} strokeWidth={1} dot={false} {...ANIM} />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
          {panes.macd && (
            <>
              <PaneLabel>MACD 12 · 26 · 9</PaneLabel>
              <ResponsiveContainer width="100%" height={90}>
                <ComposedChart data={data} syncId={SYNC} margin={PANE_MARGIN} onMouseMove={handleMove} onMouseLeave={() => setCursor(null)}>
                  <XAxis dataKey="date" hide />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={Y_WIDTH} tickCount={3} tickFormatter={v => v.toFixed(1)} />
                  <ReferenceLine y={0} stroke="var(--color-divider)" />
                  <Tooltip content={() => null} cursor={{ stroke: 'var(--color-divider)' }} />
                  <Bar dataKey="macd_histogram" isAnimationActive={false} maxBarSize={10}>
                    {data.map(row => (
                      <Cell key={row.date} fill={row.macd_histogram >= 0 ? 'var(--color-pos)' : 'var(--color-neg)'} fillOpacity={0.5} />
                    ))}
                  </Bar>
                  <Line type="linear" dataKey="macd" stroke={SERIES.primary} strokeWidth={1} dot={false} {...ANIM} />
                  <Line type="linear" dataKey="macd_signal" stroke={SERIES.overlay1} strokeWidth={1} strokeDasharray="3 3" dot={false} {...ANIM} />
                </ComposedChart>
              </ResponsiveContainer>
            </>
          )}
        </>
      )}
    </div>
  );
}
