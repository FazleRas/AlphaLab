/**
 * Loading placeholders shaped like the content they stand in for, so a
 * screen keeps its layout while the backend (sometimes cold) answers.
 */
const box = { border: '1px solid var(--color-divider)' };

export function Skeleton({ w = '100%', h = 12, style }) {
  return <div className="skeleton" aria-hidden="true" style={{ width: w, height: h, ...style }} />;
}

export function StatSkeleton() {
  return (
    <div className="p-3" style={box}>
      <Skeleton w={56} h={9} style={{ marginBottom: 8 }} />
      <Skeleton w="60%" h={14} />
    </div>
  );
}

export function StatGridSkeleton({ count = 4, className = 'grid grid-cols-2 md:grid-cols-4 gap-2 mb-6' }) {
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => <StatSkeleton key={i} />)}
    </div>
  );
}

// `bare` drops the card chrome for use inside a container that has its own.
export function ChartSkeleton({ height = 300, label = true, className = '', bare = false }) {
  return (
    <div className={`${bare ? '' : 'p-4'} ${className}`} style={bare ? undefined : box} aria-hidden="true">
      {label && <Skeleton w={110} h={9} style={{ marginBottom: 16 }} />}
      <div style={{ position: 'relative', height }}>
        {[0.2, 0.4, 0.6, 0.8].map(f => (
          <div key={f} style={{ position: 'absolute', left: 0, right: 0, top: `${f * 100}%`, borderTop: '1px solid var(--color-hairline)' }} />
        ))}
        <div className="skeleton" style={{ position: 'absolute', inset: '30% 0 0 0', opacity: 0.35 }} />
      </div>
    </div>
  );
}

export function QuoteSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="p-5 mb-4" style={box}>
        <div className="flex items-start justify-between gap-6">
          <div>
            <Skeleton w={40} h={9} style={{ marginBottom: 10 }} />
            <Skeleton w={170} h={36} />
          </div>
          <Skeleton w={180} h={48} style={{ alignSelf: 'center' }} />
          <div className="flex flex-col items-end">
            <Skeleton w={72} h={24} style={{ marginBottom: 8 }} />
            <Skeleton w={48} h={12} />
          </div>
        </div>
      </div>
      <StatGridSkeleton />
      <ChartSkeleton />
    </div>
  );
}

export function ExampleCardSkeleton() {
  return (
    <div className="p-3" style={box} aria-hidden="true">
      <div className="flex items-center justify-between mb-3">
        <Skeleton w={44} h={11} />
        <Skeleton w={60} h={11} />
      </div>
      <div className="flex items-end justify-between gap-3">
        <Skeleton w={110} h={30} style={{ opacity: 0.6 }} />
        <Skeleton w={54} h={10} />
      </div>
    </div>
  );
}

export function ScanCardSkeleton() {
  return (
    <div className="p-4 mb-3" style={box} aria-hidden="true">
      <div className="flex items-center justify-between mb-4">
        <Skeleton w={52} h={16} />
        <div className="flex items-center gap-4">
          <Skeleton w={120} h={32} style={{ opacity: 0.6 }} />
          <Skeleton w={70} h={16} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4" style={{ borderTop: '1px solid var(--color-hairline)', paddingTop: 12 }}>
        {[0, 1].map(col => (
          <div key={col}>
            {[0, 1, 2, 3].map(row => (
              <div key={row} className="flex justify-between py-1" style={{ borderBottom: '1px solid var(--color-hairline)' }}>
                <Skeleton w={90} h={9} />
                <Skeleton w={18} h={9} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
