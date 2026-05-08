import { useState, useCallback } from 'react';
import { useVitalsStore } from '../store/useVitalsStore';
import { colors } from '../lib/design-tokens';
import type { VitalsState } from '../store/types';

const navLabels: Record<string, Record<VitalsState, string>> = {
  github: { hover: 'overview', anomaly: 'anomaly', incident: 'incident', resting: '', settings: '', deploy_verified: '', onboarding: '' },
  vercel: { hover: 'deploys', anomaly: 'warnings', incident: 'logs', resting: '', settings: '', deploy_verified: '', onboarding: '' },
  sentry: { hover: 'issues', anomaly: 'anomaly', incident: 'incident', resting: '', settings: '', deploy_verified: '', onboarding: '' },
};

const navIds: VitalsState[] = ['hover', 'anomaly', 'incident'];

// --- Icons ---

function GitHubIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function VercelIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M8 0L16 14H0L8 0Z" />
    </svg>
  );
}

function SentryIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M9.14 2.07a1.28 1.28 0 0 0-2.22 0L.26 13.93a1.28 1.28 0 0 0 1.11 1.92h3.06a1.28 1.28 0 0 0 1.11-.64l.53-.92a4.6 4.6 0 0 0-1.88-1.09l-.22.38H2.13L8.03 3.2l2.66 4.62a6.2 6.2 0 0 1 1.6.92L9.14 2.07zm4.66 11.42a2.8 2.8 0 0 0-1.8-2.62 4.8 4.8 0 0 0-1.38-.82 5.4 5.4 0 0 1 1.78 3.44h-1.6a3.8 3.8 0 0 0-3.08-3.58l-.88 1.52a2.2 2.2 0 0 1 2.36 2.06H7.62l.88-1.52h1.3a3.9 3.9 0 0 1 .62-.04h3.38z" />
    </svg>
  );
}

function PostHogIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <circle cx="8" cy="8" r="3" />
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function SegmentIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <rect x="1" y="4" width="14" height="2" rx="1" />
      <rect x="3" y="7.5" width="10" height="2" rx="1" />
      <rect x="5" y="11" width="6" height="2" rx="1" />
    </svg>
  );
}

function PlusIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M7.25 1v6.25H1v1.5h6.25V15h1.5V8.75H15v-1.5H8.75V1h-1.5z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <path
        d="M6.5 1.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1.21a5.5 5.5 0 0 1 1.33.77l1.05-.6a.5.5 0 0 1 .68.18l1 1.73a.5.5 0 0 1-.18.68l-1.05.61a5.5 5.5 0 0 1 0 1.54l1.05.6a.5.5 0 0 1 .18.69l-1 1.73a.5.5 0 0 1-.68.18l-1.05-.6a5.5 5.5 0 0 1-1.33.77v1.21a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5v-1.21a5.5 5.5 0 0 1-1.33-.77l-1.05.6a.5.5 0 0 1-.68-.18l-1-1.73a.5.5 0 0 1 .18-.68l1.05-.61a5.5 5.5 0 0 1 0-1.54l-1.05-.6a.5.5 0 0 1-.18-.69l1-1.73a.5.5 0 0 1 .68-.18l1.05.6a5.5 5.5 0 0 1 1.33-.77V1.5ZM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
        fill="currentColor"
      />
    </svg>
  );
}

const integrationIcons: Record<string, React.FC<{ size?: number }>> = {
  github: GitHubIcon,
  vercel: VercelIcon,
  sentry: SentryIcon,
  posthog: PostHogIcon,
  segment: SegmentIcon,
};

function RefreshIcon({ size = 13, spinning = false }: { size?: number; spinning?: boolean }) {
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
        borderRadius: 4,
        padding: 4,
        cursor: spinning ? 'default' : 'pointer',
        color: colors.textTertiary,
        display: 'flex',
        alignItems: 'center',
        transition: 'color 0.15s',
        flexShrink: 0,
        opacity: spinning ? 0.5 : 1,
      }}
      title="refresh"
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

  const connectedIntegrations = connectors.filter((c) => c.connected);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        height: 28,
        flexShrink: 0,
        borderBottom: `0.5px solid ${colors.divider}`,
        gap: 0,
      }}
    >
      {/* Integration icons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {connectedIntegrations.map((connector) => {
          const Icon = integrationIcons[connector.id];
          const active = activeIntegration === connector.id;
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
                borderRadius: 4,
                padding: 4,
                cursor: 'pointer',
                color: active ? colors.action : colors.textTertiary,
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.15s, background 0.15s',
              }}
              title={connector.name}
            >
              {Icon && <Icon />}
            </button>
          );
        })}

        {/* + add integration */}
        <button
          onClick={() => setState('settings')}
          style={{
            background: 'none',
            border: 'none',
            borderRadius: 4,
            padding: 4,
            cursor: 'pointer',
            color: colors.textTertiary,
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.15s',
          }}
          title="add integration"
        >
          <PlusIcon />
        </button>
      </div>

      {/* Separator */}
      <div
        style={{
          width: 1,
          height: 12,
          background: colors.divider,
          margin: '0 6px',
          flexShrink: 0,
        }}
      />

      {/* Nav tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
        {navIds.map((id) => {
          const active = state === id;
          const labels = navLabels[activeIntegration] || navLabels.github;
          return (
            <button
              key={id}
              onClick={() => setState(id)}
              style={{
                background: active ? 'rgba(255,255,255,0.08)' : 'none',
                border: 'none',
                borderRadius: 4,
                padding: '3px 7px',
                cursor: 'pointer',
                color: active ? colors.textPrimary : colors.textTertiary,
                fontSize: 11,
                textTransform: 'lowercase',
                transition: 'color 0.15s, background 0.15s',
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
          borderRadius: 4,
          padding: 4,
          cursor: 'pointer',
          color: state === 'settings' ? colors.textPrimary : colors.textTertiary,
          display: 'flex',
          alignItems: 'center',
          transition: 'color 0.15s, background 0.15s',
          flexShrink: 0,
        }}
      >
        <GearIcon />
      </button>
    </div>
  );
}
