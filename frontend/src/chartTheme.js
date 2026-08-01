/**
 * Shared chart appearance: series colors, legend markers and date labels.
 *
 * Every chart pulls from here so the same kind of series reads the same way
 * wherever it appears. The subject of the chart (close price, strategy equity)
 * is always accent blue; overlays that exist for comparison (moving averages,
 * benchmarks) are grays that step back from it rather than competing for
 * attention with colors of their own.
 */

// Roles, not raw colors, so a chart asks for "the primary line" instead of
// picking a hex. These resolve to CSS variables, so both themes come for free.
export const SERIES = {
  primary: 'var(--color-accent)',
  overlay1: 'var(--color-series-1)',
  overlay2: 'var(--color-series-2)',
  negative: 'var(--color-neg)',
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Backend dates are UTC midnight — either "2026-07-28" or "2026-07-28T00:00:00Z".
// Reading those with local accessors renders the previous calendar day anywhere
// west of UTC, so every date here is read in UTC.
const toDate = (value) => {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const pad2 = (n) => String(n).padStart(2, '0');

export const formatDay = (value, { withYear = true } = {}) => {
  const d = toDate(value);
  if (!d) return '';
  const base = `${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}`;
  return withYear ? `${base} ${d.getUTCFullYear()}` : base;
};

/**
 * Build a date formatter scoped to one dataset. When every point falls in the
 * same calendar year the year is dropped: it reads identically on every tick,
 * so it's noise that costs axis width.
 */
export const makeDateFormatter = (values) => {
  const years = new Set();
  for (const v of values || []) {
    const d = toDate(v);
    if (d) years.add(d.getUTCFullYear());
  }
  const withYear = years.size > 1;
  return (value) => formatDay(value, { withYear });
};

// Recharts hands the legend click the payload entry, whose shape differs a
// little between Line and Area. Normalize to the dataKey either way.
export const legendDataKey = (entry) =>
  entry?.dataKey ?? entry?.payload?.dataKey ?? entry?.value;

export const legendWrapperStyle = {
  fontSize: '10.5px',
  letterSpacing: '0.16em',
  cursor: 'pointer',
};

// Hidden series stay listed and clickable, just dimmed, so the legend doubles
// as the control for bringing them back.
export const legendLabelStyle = (isHidden) => ({
  color: isHidden ? 'var(--color-muted)' : 'var(--color-text)',
  opacity: isHidden ? 0.5 : 1,
});

/** Solid square swatch used in tooltips, matching the legend markers. */
export const Swatch = ({ color }) => (
  <span
    style={{
      display: 'inline-block',
      width: 9,
      height: 9,
      backgroundColor: color,
      marginRight: 8,
      flex: '0 0 auto',
    }}
  />
);

export const tooltipBoxStyle = {
  backgroundColor: 'var(--color-surface)',
  border: '1px solid var(--color-divider)',
  padding: '9px 11px',
  fontSize: '12.5px',
  color: 'var(--color-text)',
};

export const axisTickStyle = {
  fontFamily: 'inherit',
  fontSize: 10,
  fill: 'var(--color-muted)',
};
