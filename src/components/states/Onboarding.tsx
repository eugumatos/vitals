import { colors, fontSize, spacing, fonts } from '../../lib/design-tokens';

export function Onboarding() {
  return (
    <div
      style={{
        padding: `${spacing.panelPaddingY + 4}px ${spacing.panelPaddingX}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        gap: 14,
      }}
    >
      <span style={{ fontSize: 28, lineHeight: 1 }}>&#x26A1;</span>
      <div
        style={{
          fontSize: fontSize.title,
          color: colors.textPrimary,
          textAlign: 'center',
        }}
      >
        No integrations connected
      </div>
      <div
        style={{
          fontSize: fontSize.body,
          color: colors.textTertiary,
          textAlign: 'center',
          lineHeight: 1.4,
        }}
      >
        Add your first integration in settings to get started.
      </div>
      <button
        onClick={() => window.vitals.openSettings()}
        style={{
          marginTop: 4,
          background: colors.action,
          border: 'none',
          borderRadius: 6,
          color: '#000',
          fontSize: fontSize.labelSecondary,
          fontFamily: fonts.system,
          fontWeight: 600,
          padding: '6px 18px',
          cursor: 'pointer',
        }}
      >
        Open Settings
      </button>
    </div>
  );
}
