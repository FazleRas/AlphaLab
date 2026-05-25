import React, { useState, useEffect } from 'react';
import { LineChart, BarChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const API = 'https://alphalab-backend.onrender.com';

export default function PriceChart({ ticker }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [period, setPeriod] = useState('3mo');
    const [chartType, setChartType] = useState('line');

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    fetch(`${API}/indicators/${ticker}?period=${period}`)
      .then(r => r.json())
      .then(d => {
        setData(d.indicators || []);
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


      {loading ? (
        <p className="font-mono text-xs" style={{ color: '#6b7280' }}>LOADING...</p>
      ) : (
        <>
        {chartType === 'line' ? (
        <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
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
            </LineChart>
        </ResponsiveContainer>
        ) : (
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <XAxis dataKey="date" tick={{ fontFamily: 'monospace', fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontFamily: 'monospace', fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={60} tickFormatter={v => `$${v}`} />
            <Tooltip contentStyle={{ backgroundColor: '#111118', border: '1px solid #1e1e2e', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }} labelStyle={{ color: '#6b7280' }} formatter={(value, name) => [`$${value}`, name.toUpperCase()]} />
            <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: '11px' }} />
            <Bar dataKey="close" fill="#2563eb" name="close" />
            </BarChart>
        </ResponsiveContainer>
        )}
        </>
      )}
    </div>
  );
}