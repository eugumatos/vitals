import { useState } from 'react';
import { useVitalsStore } from '../../store/useVitalsStore';
import { colors, fontSize, spacing, fonts } from '../../lib/design-tokens';

export function Onboarding() {
  const { connectors, setConnectorConnected } = useVitalsStore();
  const [tokenInput, setTokenInput] = useState('');
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleConnect = (id: string) => {
    setConnectingId(id);
    setTokenInput('');
    setFeedback(null);
  };

  const handleSubmitToken = async () => {
    if (!connectingId || !tokenInput.trim()) return;

    if (connectingId === 'github') {
      const result = await window.vitals.github.setToken(tokenInput.trim());
      if (result.success) {
        setConnectorConnected('github', true);
        setFeedback('connected');
        setConnectingId(null);
        setTokenInput('');
      } else {
        setFeedback(result.error || 'failed');
      }
    }
  };

  const hasAnyConnected = connectors.some((c) => c.connected);

  return (
    <div
      style={{
        padding: `${spacing.panelPaddingY + 4}px ${spacing.panelPaddingX}px`,
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
      }}
    >
      <div style={{ marginBottom: spacing.sectionGap + 2 }}>
        <div
          style={{
            fontSize: fontSize.title,
            color: colors.textPrimary,
            marginBottom: 4,
          }}
        >
          Connect your tools
        </div>
        <div
          style={{
            fontSize: fontSize.body,
            color: colors.textTertiary,
            lineHeight: 1.4,
          }}
        >
          Vitals correlates signals across your stack. Connect at least one to start.
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        {connectors.map((connector, i) => (
          <div key={connector.id}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `${spacing.lineGap + 4}px 0`,
                borderBottom:
                  i < connectors.length - 1 && connectingId !== connector.id
                    ? `0.5px solid ${colors.divider}`
                    : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: connector.connected
                      ? colors.healthy
                      : colors.textTertiary,
                  }}
                />
                <span
                  style={{
                    fontSize: fontSize.bodyLarge,
                    color: colors.textPrimary,
                  }}
                >
                  {connector.name}
                </span>
              </div>
              <button
                onClick={() =>
                  connector.connected ? null : handleConnect(connector.id)
                }
                style={{
                  background: connector.connected ? 'none' : colors.subtle,
                  border: connector.connected
                    ? `0.5px solid ${colors.divider}`
                    : 'none',
                  borderRadius: 5,
                  color: connector.connected
                    ? colors.textTertiary
                    : colors.action,
                  fontSize: fontSize.labelSecondary,
                  padding: '3px 10px',
                  cursor: connector.connected ? 'default' : 'pointer',
                }}
              >
                {connector.connected ? 'connected' : 'connect'}
              </button>
            </div>

            {connectingId === connector.id && (
              <div
                style={{
                  padding: `${spacing.lineGap + 2}px 0`,
                  borderBottom:
                    i < connectors.length - 1
                      ? `0.5px solid ${colors.divider}`
                      : 'none',
                }}
              >
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmitToken()}
                    placeholder="ghp_..."
                    style={{
                      flex: 1,
                      background: colors.subtle,
                      border: `0.5px solid ${colors.divider}`,
                      borderRadius: 4,
                      color: colors.textPrimary,
                      fontSize: fontSize.labelSecondary,
                      fontFamily: fonts.mono,
                      padding: '4px 8px',
                      outline: 'none',
                    }}
                    autoFocus
                  />
                  <button
                    onClick={handleSubmitToken}
                    style={{
                      background: colors.action,
                      border: 'none',
                      borderRadius: 4,
                      color: '#000',
                      fontSize: fontSize.labelSecondary,
                      fontWeight: 600,
                      padding: '4px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    save
                  </button>
                </div>
                {feedback && (
                  <div
                    style={{
                      fontSize: fontSize.labelSecondary,
                      color:
                        feedback === 'connected'
                          ? colors.healthy
                          : colors.incident,
                      marginTop: 4,
                    }}
                  >
                    {feedback}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 'auto',
          paddingTop: spacing.sectionGap,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: fontSize.labelSecondary,
            color: colors.textTertiary,
          }}
        >
          you can add more later in settings
        </span>
        {hasAnyConnected && (
          <button
            onClick={() => useVitalsStore.getState().setState('resting')}
            style={{
              background: colors.action,
              border: 'none',
              borderRadius: 6,
              color: '#000',
              fontSize: fontSize.labelSecondary,
              fontWeight: 600,
              padding: '5px 14px',
              cursor: 'pointer',
            }}
          >
            done
          </button>
        )}
      </div>
    </div>
  );
}
