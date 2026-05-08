import { colors } from '../../lib/design-tokens';

const shimmerKeyframes = `
@keyframes vitals-shimmer {
  0% { background-position: -200px 0; }
  100% { background-position: 200px 0; }
}
`;

// Inject keyframes once
let injected = false;
function injectKeyframes() {
  if (injected) return;
  const style = document.createElement('style');
  style.textContent = shimmerKeyframes;
  document.head.appendChild(style);
  injected = true;
}

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = 12, borderRadius = 3, style }: SkeletonProps) {
  injectKeyframes();
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background: `linear-gradient(90deg, ${colors.subtle} 0%, rgba(255,255,255,0.08) 50%, ${colors.subtle} 100%)`,
        backgroundSize: '400px 100%',
        animation: 'vitals-shimmer 1.8s ease-in-out infinite',
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

export function SkeletonLine({ width = '100%' }: { width?: number | string }) {
  return <Skeleton width={width} height={10} />;
}

interface SkeletonRowProps {
  dotSize?: number;
  lines?: number;
}

export function SkeletonRow({ dotSize = 6, lines = 1 }: SkeletonRowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
      <Skeleton width={dotSize} height={dotSize} borderRadius={dotSize} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonLine key={i} width={i === 0 ? '70%' : '45%'} />
        ))}
      </div>
      <Skeleton width={30} height={10} />
    </div>
  );
}

export function SkeletonList({ rows = 3, withDividers = true }: { rows?: number; withDividers?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            borderBottom: withDividers && i < rows - 1 ? `0.5px solid ${colors.divider}` : 'none',
            paddingBottom: 4,
            marginBottom: 4,
          }}
        >
          <SkeletonRow />
        </div>
      ))}
    </div>
  );
}
