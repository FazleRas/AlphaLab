import { useId } from 'react';

/**
 * Tiny inline price line. Plain SVG rather than Recharts: dozens of these can
 * sit in a list, and each one is a single path with no axes or tooltip.
 *
 * Colour follows direction across the window (first point to last) unless one
 * is passed. On mount the stroke draws itself in and the fill fades up.
 */
export default function Sparkline({
  data,
  width = 96,
  height = 28,
  color,
  strokeWidth = 1.25,
  fill = true,
  animate = true,
  style,
}) {
  // useId can contain colons, which break inside url(#...).
  const id = `sp${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const pts = (data || []).filter(v => typeof v === 'number' && Number.isFinite(v));
  if (pts.length < 2) {
    return <span aria-hidden="true" style={{ display: 'inline-block', width, height, ...style }} />;
  }

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const pad = 2;
  const step = (width - pad * 2) / (pts.length - 1);
  const coords = pts.map((v, i) => [
    pad + i * step,
    pad + (1 - (v - min) / span) * (height - pad * 2),
  ]);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [lx, ly] = coords[coords.length - 1];
  const area = `${line} L${lx.toFixed(1)} ${height} L${coords[0][0].toFixed(1)} ${height} Z`;
  const up = pts[pts.length - 1] >= pts[0];
  const stroke = color || (up ? 'var(--color-pos)' : 'var(--color-neg)');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={{ display: 'block', overflow: 'visible', flex: '0 0 auto', ...style }}
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={stroke} stopOpacity="0.3" />
              <stop offset="1" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id})`} className={animate ? 'spark-fill' : undefined} />
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength="1"
        className={animate ? 'spark-draw' : undefined}
      />
      <circle cx={lx} cy={ly} r={2} fill={stroke} className={animate ? 'spark-fill' : undefined} />
    </svg>
  );
}

/** Percent move across a sparkline window, e.g. "+4.2% 1M". */
export function WindowChange({ data, label = '1M', className = 'font-mono text-xs' }) {
  const pts = (data || []).filter(v => typeof v === 'number' && Number.isFinite(v));
  if (pts.length < 2 || pts[0] === 0) return null;
  const pct = ((pts[pts.length - 1] - pts[0]) / pts[0]) * 100;
  const up = pct >= 0;
  return (
    <span className={className} style={{ color: up ? 'var(--color-pos)' : 'var(--color-neg)', whiteSpace: 'nowrap' }}>
      {up ? '+' : ''}{pct.toFixed(1)}%{' '}
      <span style={{ color: 'var(--color-muted)' }}>{label}</span>
    </span>
  );
}
