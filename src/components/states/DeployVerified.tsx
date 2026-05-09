import { useVitalsStore } from '../../store/useVitalsStore';
import { colors, fontSize, spacing, fonts } from '../../lib/design-tokens';

export function DeployVerified() {
  const restingDeploy = useVitalsStore((s) => s.restingDeploy);
  const hasData = restingDeploy.sha.length > 0;

  if (!hasData) return null;

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
            backgroundColor: restingDeploy.status === 'success' ? colors.healthy : restingDeploy.status === 'failure' ? colors.incident : colors.anomaly,
          }}
        />
        <span style={{ fontSize: fontSize.title, color: restingDeploy.status === 'success' ? colors.healthy : restingDeploy.status === 'failure' ? colors.incident : colors.anomaly }}>
          {restingDeploy.status === 'success' ? 'Deploy verified' : restingDeploy.status === 'failure' ? 'Deploy failed' : 'Deploying…'}
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
          {restingDeploy.sha}
        </span>
        <span style={{ fontSize: fontSize.body, color: colors.textSecondary }}>
          {restingDeploy.time}
        </span>
      </div>

      {restingDeploy.repo && (
        <div>
          <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, textTransform: 'lowercase' }}>
            repo
          </span>
          <div style={{ fontSize: fontSize.body, color: colors.textPrimary, marginTop: 1, fontFamily: fonts.mono }}>
            {restingDeploy.repo}
          </div>
        </div>
      )}
    </div>
  );
}
