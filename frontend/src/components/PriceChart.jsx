import React, { useState, useEffect } from 'react';
import { LineChart, BarChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceDot, ReferenceArea } from 'recharts';
import API from '../config';

export default function PriceChart({ ticker }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [period, setPeriod] = useState('3mo');
    const [chartType, setChartType] = useState('line');
    const [measure, setMeasure] = useState({ a: null, b: null });

  // Click two points on the chart to measure the move between them. Recharts v3
  // gives us activeLabel (the date) on click, not the data point, so we look the
  // close up from the loaded series.
  const handleChartClick = (e) => {
    if (!e || e.activeLabel == null) return;
    const idx = e.activeIndex ?? e.activeTooltipIndex;
    const row = (idx != null && data[idx]) || data.find(d => d.date === e.activeLabel);
    if (!row) return;
    const point = { date: e.activeLabel, close: row.close };
    setMeasure(prev => (!prev.a || prev.b ? { a: point, b: null } : { ...prev, b: point }));
  };

  const measureRefs = () => {
    const els = [];
    if (measure.a) els.push(<ReferenceDot key="a" x={measure.a.date} y={measure.a.close} r={4} fill="#f97316" stroke="#0a0a0f" ifOverflow="visible" />);
    if (measure.b) {
      els.push(<ReferenceArea key="area" x1={measure.a.date} x2={measure.b.date} fill="#f97316" fillOpacity={0.08} ifOverflow="visible" />);
      els.push(<ReferenceDot key="b" x={measure.b.date} y={measure.b.close} r={4} fill="#f97316" stroke="#0a0a0f" ifOverflow="visible" />);
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
  <div className="rounded p-4 mt-4" style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e' }}>
    <div className="flex items-center justify-between mb-4">
      <p className="font-mono text-xs tracking-widest" style={{ color: '#6b7280' }}>PRICE CHART</p>
      <div className="flex items-center gap-2">
        {periods.map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className="font-mono text-xs px-2 py-1 rounded"
            style={{
              backgroundColor: period === p ? '#2563eb20' : 'transparent',
              border: `1px solid ${period === p ? '#2563eb' : '#1e1e2e'}`,
              color: period === p ? '#2563eb' : '#6b7280',
            }}
          >
            {p.toUpperCase()}
          </button>
        ))}
        <div className="flex gap-2 ml-2" style={{ borderLeft: '1px solid #1e1e2e', paddingLeft: '8px' }}>
          {['line', 'bar'].map(type => (
            <button
              key={type}
              onClick={() => setChartType(type)}
              className="font-mono text-xs px-2 py-1 rounded"
              style={{
                backgroundColor: chartType === type ? '#2563eb20' : 'transparent',
                border: `1px solid ${chartType === type ? '#2563eb' : '#1e1e2e'}`,
                color: chartType === type ? '#2563eb' : '#6b7280',
              }}
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
          <span style={{ color: '#6b7280' }}>Tip: click two points to measure the move between them.</span>
        ) : (
          <>
            <span style={{ color: '#f97316' }}>A {measure.a.date} ${measure.a.close}</span>
            {measure.b && <span style={{ color: '#f97316' }}>B {measure.b.date} ${measure.b.close}</span>}
            {delta && (
              <span style={{ color: delta.abs >= 0 ? '#00c896' : '#ff4d6d' }}>
                {delta.abs >= 0 ? '+' : ''}{delta.pct.toFixed(2)}% ({delta.abs >= 0 ? '+' : ''}${delta.abs.toFixed(2)}) · {delta.days}d
              </span>
            )}
            <button
              onClick={() => setMeasure({ a: null, b: null })}
              className="px-2 py-0.5 rounded"
              style={{ border: '1px solid #1e1e2e', color: '#6b7280' }}
            >
              CLEAR
            </button>
          </>
        )}
      </div>
    )}

      {loading ? (
        <p className="font-mono text-xs" style={{ color: '#6b7280' }}>LOADING...</p>
      ) : error ? (
        <p className="font-mono text-xs" style={{ color: '#ff4d6d' }}>{error}</p>
      ) : (
        <>
        {chartType === 'line' ? (
        <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }} onClick={handleChartClick} style={{ cursor: 'crosshair' }}>
            <XAxis dataKey="date" tick={{ fontFamily: 'monospace', fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontFamily: 'monospace', fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={60} tickFormatter={v => `$${v}`} />
            <Tooltip contentStyle={{ backgroundColor: '#111118', border: '1px solid #1e1e2e', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }} labelStyle={{ color: '#6b7280' }} formatter={(value, name) => {
                if (name === 'close' && data.length > 0) {
                const first = data[0]?.close;
                const pct = first ? ((value - first) / first * 100).toFixed(2) : 0;
                return [`$${value} (${pct > 0 ? '+' : ''}${pct}%)`, name.toUpperCase()];
                }
                return [`$${value}`, name.toUpperCase()];
            }} />
            <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: '11px' }} />
            <Line type="monotone" dataKey="close" stroke="#2563eb" dot={false} strokeWidth={1.5} name="close" />
            <Line type="monotone" dataKey="sma_20" stroke="#00c896" dot={false} strokeWidth={1} strokeDasharray="4 4" name="sma20" />
            <Line type="monotone" dataKey="sma_50" stroke="#ff4d6d" dot={false} strokeWidth={1} strokeDasharray="4 4" name="sma50" />
            {measureRefs()}
            </LineChart>
        </ResponsiveContainer>
        ) : (
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }} onClick={handleChartClick} style={{ cursor: 'crosshair' }}>
            <XAxis dataKey="date" tick={{ fontFamily: 'monospace', fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontFamily: 'monospace', fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={60} tickFormatter={v => `$${v}`} />
            <Tooltip contentStyle={{ backgroundColor: '#111118', border: '1px solid #1e1e2e', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }} labelStyle={{ color: '#6b7280' }} formatter={(value, name) => [`$${value}`, name.toUpperCase()]} />
            <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: '11px' }} />
            <Bar dataKey="close" fill="#2563eb" name="close" />
            {measureRefs()}
            </BarChart>
        </ResponsiveContainer>
        )}
        </>
      )}
    </div>
  );
}