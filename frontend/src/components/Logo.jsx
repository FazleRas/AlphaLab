/**
 * AlphaLab mark: a peak that flattens into a baseline — the A of AlphaLab
 * drawn as a price move.
 *
 * Stroked with `currentColor` rather than a fixed fill, so it takes the colour
 * of whatever it sits in and needs no separate light/dark variant.
 */
export default function Logo({ size = 18, strokeWidth = 9, className, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="AlphaLab"
      className={className}
      style={style}
    >
      <path d="M11 61 L36 27 L56 61 L94 61" />
    </svg>
  );
}
