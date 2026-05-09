import { useState, useCallback } from 'react';
import { useVitalsStore } from '../store/useVitalsStore';
import { colors } from '../lib/design-tokens';
import type { VitalsState } from '../store/types';

const navLabels: Record<string, Record<VitalsState, string>> = {
  github: { hover: 'overview', anomaly: 'anomaly', incident: 'incident', resting: '', settings: '', deploy_verified: '', onboarding: '' },
  vercel: { hover: 'deploys', anomaly: 'warnings', incident: 'logs', resting: '', settings: '', deploy_verified: '', onboarding: '' },
  sentry: { hover: 'issues', anomaly: 'anomaly', incident: 'incident', resting: '', settings: '', deploy_verified: '', onboarding: '' },
  openai: { hover: 'usage', anomaly: 'costs', incident: 'details', resting: '', settings: '', deploy_verified: '', onboarding: '' },
  anthropic: { hover: 'usage', anomaly: 'costs', incident: 'details', resting: '', settings: '', deploy_verified: '', onboarding: '' },
  datadog: { hover: 'monitors', anomaly: 'alerts', incident: 'events', resting: '', settings: '', deploy_verified: '', onboarding: '' },
  posthog: { hover: 'events', anomaly: 'flags', incident: 'insights', resting: '', settings: '', deploy_verified: '', onboarding: '' },
  segment: { hover: 'sources', anomaly: 'status', incident: 'details', resting: '', settings: '', deploy_verified: '', onboarding: '' },
  chrome: { hover: 'logs', anomaly: 'network', incident: '', resting: '', settings: '', deploy_verified: '', onboarding: '' },
};

const defaultNavIds: VitalsState[] = ['hover', 'anomaly', 'incident'];
const chromeNavIds: VitalsState[] = ['hover', 'anomaly'];

// --- Icons ---

function GitHubIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function VercelIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M8 0L16 14H0L8 0Z" />
    </svg>
  );
}

function SentryIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M9.14 2.07a1.28 1.28 0 0 0-2.22 0L.26 13.93a1.28 1.28 0 0 0 1.11 1.92h3.06a1.28 1.28 0 0 0 1.11-.64l.53-.92a4.6 4.6 0 0 0-1.88-1.09l-.22.38H2.13L8.03 3.2l2.66 4.62a6.2 6.2 0 0 1 1.6.92L9.14 2.07zm4.66 11.42a2.8 2.8 0 0 0-1.8-2.62 4.8 4.8 0 0 0-1.38-.82 5.4 5.4 0 0 1 1.78 3.44h-1.6a3.8 3.8 0 0 0-3.08-3.58l-.88 1.52a2.2 2.2 0 0 1 2.36 2.06H7.62l.88-1.52h1.3a3.9 3.9 0 0 1 .62-.04h3.38z" />
    </svg>
  );
}

function PostHogIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <circle cx="8" cy="8" r="3" />
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function SegmentIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <rect x="1" y="4" width="14" height="2" rx="1" />
      <rect x="3" y="7.5" width="10" height="2" rx="1" />
      <rect x="5" y="11" width="6" height="2" rx="1" />
    </svg>
  );
}

function OpenAIIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }}>
      <path d="M22.28 9.37a5.99 5.99 0 0 0-.52-4.93 6.07 6.07 0 0 0-6.52-2.91A5.99 5.99 0 0 0 10.69 0a6.07 6.07 0 0 0-5.78 4.18 5.99 5.99 0 0 0-4.01 2.91A6.07 6.07 0 0 0 1.64 13a5.99 5.99 0 0 0 .52 4.93 6.07 6.07 0 0 0 6.52 2.91A5.99 5.99 0 0 0 13.23 22a6.07 6.07 0 0 0 5.78-4.18 5.99 5.99 0 0 0 4.01-2.91 6.07 6.07 0 0 0-.74-5.54zM13.23 20.6a4.49 4.49 0 0 1-2.88-1.05l.14-.08 4.78-2.76a.78.78 0 0 0 .39-.67v-6.74l2.02 1.17a.07.07 0 0 1 .04.06v5.58a4.52 4.52 0 0 1-4.49 4.49zM3.6 16.82a4.49 4.49 0 0 1-.54-3.02l.14.09 4.78 2.76a.78.78 0 0 0 .78 0l5.83-3.37v2.33a.07.07 0 0 1-.03.06l-4.83 2.79a4.52 4.52 0 0 1-6.13-1.64zM2.34 7.89A4.49 4.49 0 0 1 4.69 5.9v5.69a.78.78 0 0 0 .39.67l5.83 3.37-2.02 1.17a.07.07 0 0 1-.07 0L4 13.99a4.52 4.52 0 0 1-1.66-6.1zm17.05 3.97l-5.83-3.37 2.02-1.17a.07.07 0 0 1 .07 0l4.83 2.79a4.52 4.52 0 0 1-.69 8.14v-5.72a.78.78 0 0 0-.4-.67zm2.01-3.03l-.14-.09-4.78-2.76a.78.78 0 0 0-.78 0l-5.83 3.37V7.02a.07.07 0 0 1 .03-.06l4.83-2.79a4.52 4.52 0 0 1 6.67 4.66zM8.68 13.34l-2.02-1.17a.07.07 0 0 1-.04-.06V6.53a4.52 4.52 0 0 1 7.4-3.47l-.14.08-4.78 2.76a.78.78 0 0 0-.39.67l-.03 6.77zm1.1-2.37l2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5v-3z" />
    </svg>
  );
}

function DatadogIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M10.93 2.08L8.94.42 7.1 1.87l-.47-.36L4.4 3.32l.6.77-.42.56 1.6 1.2-.07.85 1.38 1.02.7-.65 1.42.53.17-.65 1.63-.15.22-1.27 1.1-.87-.18-1.05-1.62-1.52zm-1.2 7.34l-.88-.53-.95.75-1.25-.93.1-1.08-1.3-.97-.64.44-.6-.77-1.04.84.27 4.63 3.52 2.56 4.31-1.67.39-4.42-1.03.45-.9.7z" />
    </svg>
  );
}

function AnthropicIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }}>
      <path d="M13.83 2H16.7l6.3 20h-2.87l-1.46-4.87H13.2L16.03 2zm.86 12.26h3.65L16.5 8.16l-1.81 6.1zM7.3 2H4.12L0 22h2.87l1.04-5.17h5.12L10.07 22H13L7.3 2zm-2.6 12.26L6.71 6.1l2.43 8.16H4.7z" />
    </svg>
  );
}

function PlusIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M7.25 1v6.25H1v1.5h6.25V15h1.5V8.75H15v-1.5H8.75V1h-1.5z" />
    </svg>
  );
}

function ChromeIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <line x1="10.5" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.2" />
      <line x1="6.75" y1="5.67" x2="4.25" y2="1.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="6.75" y1="10.33" x2="4.25" y2="14.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <path
        d="M6.5 1.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1.21a5.5 5.5 0 0 1 1.33.77l1.05-.6a.5.5 0 0 1 .68.18l1 1.73a.5.5 0 0 1-.18.68l-1.05.61a5.5 5.5 0 0 1 0 1.54l1.05.6a.5.5 0 0 1 .18.69l-1 1.73a.5.5 0 0 1-.68.18l-1.05-.6a5.5 5.5 0 0 1-1.33.77v1.21a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5v-1.21a5.5 5.5 0 0 1-1.33-.77l-1.05.6a.5.5 0 0 1-.68-.18l-1-1.73a.5.5 0 0 1 .18-.68l1.05-.61a5.5 5.5 0 0 1 0-1.54l-1.05-.6a.5.5 0 0 1-.18-.69l1-1.73a.5.5 0 0 1 .68-.18l1.05.6a5.5 5.5 0 0 1 1.33-.77V1.5ZM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
        fill="currentColor"
      />
    </svg>
  );
}

export const integrationIcons: Record<string, React.FC<{ size?: number }>> = {
  github: GitHubIcon,
  vercel: VercelIcon,
  sentry: SentryIcon,
  posthog: PostHogIcon,
  segment: SegmentIcon,
  openai: OpenAIIcon,
  anthropic: AnthropicIcon,
  datadog: DatadogIcon,
  chrome: ChromeIcon,
};

function RefreshIcon({ size = 14, spinning = false }: { size?: number; spinning?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={{
        display: 'block',
        transition: 'transform 0.5s ease',
        transform: spinning ? 'rotate(360deg)' : 'rotate(0deg)',
      }}
    >
      <path
        d="M13.65 2.35A7.96 7.96 0 0 0 8 0a8 8 0 1 0 8 8h-2a6 6 0 1 1-1.76-4.24L9.5 6.5H16V0l-2.35 2.35Z"
        fill="currentColor"
      />
    </svg>
  );
}

function RefreshButton() {
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (spinning) return;
    setSpinning(true);
    await window.vitals.forceRefresh();
    setTimeout(() => setSpinning(false), 600);
  }, [spinning]);

  return (
    <button
      onClick={handleRefresh}
      style={{
        background: 'none',
        border: 'none',
        borderRadius: 8,
        padding: 5,
        cursor: spinning ? 'default' : 'pointer',
        color: colors.textTertiary,
        display: 'flex',
        alignItems: 'center',
        transition: 'color 0.2s, transform 0.2s ease',
        flexShrink: 0,
        opacity: spinning ? 0.5 : 1,
      }}
      title="refresh"
      onMouseEnter={(e) => { if (!spinning) e.currentTarget.style.transform = 'scale(1.15)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <RefreshIcon spinning={spinning} />
    </button>
  );
}

export function NotchHeader() {
  const state = useVitalsStore((s) => s.state);
  const setState = useVitalsStore((s) => s.setState);
  const connectors = useVitalsStore((s) => s.connectors);
  const activeIntegration = useVitalsStore((s) => s.activeIntegration);
  const setActiveIntegration = useVitalsStore((s) => s.setActiveIntegration);
  const serviceErrors = useVitalsStore((s) => s.serviceErrors);

  const connectedIntegrations = connectors.filter((c) => c.connected);

  return (
    <>
    <style>{`@keyframes vitals-error-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.8); } }`}</style>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        height: 32,
        flexShrink: 0,
        borderBottom: `0.5px solid ${colors.divider}`,
        gap: 0,
      }}
    >
      {/* Integration icons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {connectedIntegrations.map((connector) => {
          const Icon = integrationIcons[connector.id];
          const active = activeIntegration === connector.id;
          const hasError = !!serviceErrors[connector.id];
          return (
            <button
              key={connector.id}
              onClick={() => {
                setActiveIntegration(connector.id);
                if (state !== 'hover' && state !== 'anomaly' && state !== 'incident') {
                  setState('hover');
                }
              }}
              style={{
                background: active ? 'rgba(255,255,255,0.10)' : 'none',
                border: 'none',
                borderRadius: 8,
                padding: 5,
                cursor: 'pointer',
                color: active ? colors.action : colors.textTertiary,
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.2s, background 0.2s, transform 0.2s ease',
                position: 'relative',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              title={hasError ? `${connector.name} — error: ${serviceErrors[connector.id]}` : connector.name}
            >
              {Icon && <Icon />}
              {hasError && (
                <div
                  style={{
                    position: 'absolute',
                    top: 1,
                    right: 1,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: colors.incident,
                    animation: 'vitals-error-pulse 2s ease-in-out infinite',
                  }}
                />
              )}
            </button>
          );
        })}

        {/* + add integration */}
        <button
          onClick={() => setState('settings')}
          style={{
            background: 'none',
            border: 'none',
            borderRadius: 8,
            padding: 5,
            cursor: 'pointer',
            color: colors.textTertiary,
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.2s, transform 0.2s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15) rotate(90deg)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1) rotate(0deg)'; }}
          title="add integration"
        >
          <PlusIcon />
        </button>
      </div>

      {/* Separator */}
      <div
        style={{
          width: 1,
          height: 14,
          background: colors.divider,
          margin: '0 8px',
          flexShrink: 0,
          borderRadius: 1,
        }}
      />

      {/* Nav tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1 }}>
        {(activeIntegration === 'chrome' ? chromeNavIds : defaultNavIds).map((id) => {
          const active = state === id;
          const labels = navLabels[activeIntegration] || navLabels.github;
          return (
            <button
              key={id}
              onClick={() => setState(id)}
              style={{
                background: active ? 'rgba(255,255,255,0.08)' : 'none',
                border: 'none',
                borderRadius: 8,
                padding: '4px 9px',
                cursor: 'pointer',
                color: active ? colors.textPrimary : colors.textTertiary,
                fontSize: 12,
                textTransform: 'lowercase',
                transition: 'color 0.2s, background 0.2s',
              }}
            >
              {labels[id]}
            </button>
          );
        })}
      </div>

      {/* Refresh */}
      <RefreshButton />

      {/* Settings gear */}
      <button
        onClick={() => setState('settings')}
        style={{
          background: state === 'settings' ? 'rgba(255,255,255,0.08)' : 'none',
          border: 'none',
          borderRadius: 8,
          padding: 5,
          cursor: 'pointer',
          color: state === 'settings' ? colors.textPrimary : colors.textTertiary,
          display: 'flex',
          alignItems: 'center',
          transition: 'color 0.2s, background 0.2s, transform 0.3s ease',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'rotate(45deg)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'rotate(0deg)'; }}
      >
        <GearIcon />
      </button>
    </div>
    </>
  );
}
