import { useVitalsStore } from '../../store/useVitalsStore';
import { colors, fontSize } from '../../lib/design-tokens';

function GearIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      style={{ display: 'block' }}
    >
      <path
        d="M6.5 1.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1.21a5.5 5.5 0 0 1 1.33.77l1.05-.6a.5.5 0 0 1 .68.18l1 1.73a.5.5 0 0 1-.18.68l-1.05.61a5.5 5.5 0 0 1 0 1.54l1.05.6a.5.5 0 0 1 .18.69l-1 1.73a.5.5 0 0 1-.68.18l-1.05-.6a5.5 5.5 0 0 1-1.33.77v1.21a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5v-1.21a5.5 5.5 0 0 1-1.33-.77l-1.05.6a.5.5 0 0 1-.68-.18l-1-1.73a.5.5 0 0 1 .18-.68l1.05-.61a5.5 5.5 0 0 1 0-1.54l-1.05-.6a.5.5 0 0 1-.18-.69l1-1.73a.5.5 0 0 1 .68-.18l1.05.6a5.5 5.5 0 0 1 1.33-.77V1.5ZM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Resting() {
  const { restingMetric } = useVitalsStore();
  const setState = useVitalsStore((s) => s.setState);
  const statusColor = colors.healthy;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      {/* Zone C — right side: metric + gear */}
      <div
        style={{
          position: 'absolute',
          right: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: statusColor,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: fontSize.labelSecondary,
              color: colors.textSecondary,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.01em',
            }}
          >
            {restingMetric.value} {restingMetric.label}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setState('settings');
          }}
          style={{
            background: 'none',
            border: 'none',
            padding: 2,
            cursor: 'pointer',
            color: colors.textTertiary,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <GearIcon />
        </button>
      </div>
    </div>
  );
}
