import { useVitalsStore } from '../../store/useVitalsStore';
import { colors, fontSize, spacing, fonts } from '../../lib/design-tokens';

export function DeployVerified() {
  const { deployVerified } = useVitalsStore();
  if (!deployVerified) return null;

  return (
    <div
      style={{
        padding: `${spacing.panelPaddingY + 2}px ${spacing.panelPaddingX}px`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        gap: spacing.sectionGap,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            backgroundColor: colors.healthy,
          }}
        />
        <span style={{ fontSize: fontSize.title, color: colors.healthy }}>
          Deploy verified
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          paddingBottom: spacing.lineGap + 2,
          borderBottom: `0.5px solid ${colors.divider}`,
        }}
      >
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: fontSize.bodyLarge,
            color: colors.textPrimary,
            background: colors.subtle,
            padding: '1px 4px',
            borderRadius: 3,
          }}
        >
          {deployVerified.sha}
        </span>
        <span
          style={{
            fontSize: fontSize.body,
            color: colors.textSecondary,
          }}
        >
          {deployVerified.message}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <div>
          <span
            style={{
              fontSize: fontSize.labelSecondary,
              color: colors.textTertiary,
              textTransform: 'lowercase',
            }}
          >
            project
          </span>
          <div
            style={{
              fontSize: fontSize.body,
              color: colors.textPrimary,
              marginTop: 1,
            }}
          >
            {deployVerified.project}
          </div>
        </div>
        <div>
          <span
            style={{
              fontSize: fontSize.labelSecondary,
              color: colors.textTertiary,
              textTransform: 'lowercase',
            }}
          >
            build time
          </span>
          <div
            style={{
              fontSize: fontSize.body,
              color: colors.textPrimary,
              fontVariantNumeric: 'tabular-nums',
              marginTop: 1,
            }}
          >
            {deployVerified.duration}
          </div>
        </div>
        <div>
          <span
            style={{
              fontSize: fontSize.labelSecondary,
              color: colors.textTertiary,
              textTransform: 'lowercase',
            }}
          >
            deployed
          </span>
          <div
            style={{
              fontSize: fontSize.body,
              color: colors.textPrimary,
              marginTop: 1,
            }}
          >
            {deployVerified.timestamp}
          </div>
        </div>
      </div>
    </div>
  );
}
