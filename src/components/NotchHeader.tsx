import { useState, useCallback, useRef, useEffect } from 'react';
import { useVitalsStore } from '../store/useVitalsStore';
import { colors, fontSize, fonts } from '../lib/design-tokens';
import type { VitalsState, VitalsNotification } from '../store/types';
import { formatTimeAgo } from '../lib/utils';

// Per-integration tab definitions — each integration has its own relevant tabs
export const integrationTabs: Record<string, string[]> = {
  github: ['prs', 'actions', 'notifications'],
  vercel: ['deploys', 'projects'],
  sentry: ['issues', 'stats'],
  openai: ['overview', 'models'],
  anthropic: ['activity', 'models'],
  datadog: ['monitors', 'events'],
  supabase: [],  // single view, no tabs needed
};

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

function SupabaseIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }}>
      <path d="M13.7 21.8c-.5.7-1.6.3-1.6-.6V13h8.2c1 0 1.6 1.2.9 2l-7.5 6.8z" opacity="0.6" />
      <path d="M10.3 2.2c.5-.7 1.6-.3 1.6.6V11H3.7c-1 0-1.6-1.2-.9-2l7.5-6.8z" />
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
  supabase: SupabaseIcon,
  openai: OpenAIIcon,
  anthropic: AnthropicIcon,
  datadog: DatadogIcon,
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

function ClearErrorsButton() {
  const clearErrors = useVitalsStore((s) => s.clearErrors);
  return (
    <button
      onClick={clearErrors}
      style={{
        background: 'none',
        border: 'none',
        borderRadius: 8,
        padding: 5,
        cursor: 'pointer',
        color: colors.incident,
        display: 'flex',
        alignItems: 'center',
        transition: 'color 0.2s, transform 0.2s ease',
        flexShrink: 0,
      }}
      title="clear errors"
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
      </svg>
    </button>
  );
}

function BellIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M8 1.5a.5.5 0 0 0-.5.5v.54A4.5 4.5 0 0 0 3.5 7v3.5l-1 1.5h11l-1-1.5V7a4.5 4.5 0 0 0-4-4.46V2a.5.5 0 0 0-.5-.5zM6.5 13a1.5 1.5 0 0 0 3 0h-3z" />
    </svg>
  );
}

const kindColor: Record<string, string> = {
  deploy: colors.healthy,
  anomaly: colors.anomaly,
  action: colors.info,
  error: colors.incident,
};

const severityIcon: Record<string, string> = {
  info: '',
  warning: '',
  critical: '',
};

function NotificationFeed({ onClose }: { onClose: () => void }) {
  const notifications = useVitalsStore((s) => s.notifications);
  const markNotificationRead = useVitalsStore((s) => s.markNotificationRead);
  const markAllNotificationsRead = useVitalsStore((s) => s.markAllNotificationsRead);
  const clearNotifications = useVitalsStore((s) => s.clearNotifications);
  const setState = useVitalsStore((s) => s.setState);
  const setActiveIntegration = useVitalsStore((s) => s.setActiveIntegration);
  const feedRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (feedRef.current && !feedRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const sorted = [...notifications].reverse(); // newest first

  return (
    <div
      ref={feedRef}
      style={{
        position: 'absolute',
        top: 32,
        right: 40,
        width: 300,
        maxHeight: 280,
        background: '#1c1c1e',
        border: `0.5px solid ${colors.divider}`,
        borderRadius: 12,
        overflow: 'hidden',
        zIndex: 100,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: `0.5px solid ${colors.divider}`,
      }}>
        <span style={{ fontSize: 12, color: colors.textPrimary, fontWeight: 600 }}>Notifications</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {notifications.some((n) => !n.read) && (
            <button
              onClick={markAllNotificationsRead}
              style={{
                background: 'none',
                border: 'none',
                color: colors.info,
                fontSize: 10,
                fontFamily: fonts.mono,
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={clearNotifications}
              style={{
                background: 'none',
                border: 'none',
                color: colors.textTertiary,
                fontSize: 10,
                fontFamily: fonts.mono,
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              clear
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', maxHeight: 240 }}>
        {sorted.length === 0 ? (
          <div style={{
            padding: '24px 12px',
            textAlign: 'center',
            fontSize: fontSize.labelSecondary,
            color: colors.textTertiary,
          }}>
            no notifications yet
          </div>
        ) : (
          sorted.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                markNotificationRead(n.id);
                if (n.targetIntegration) setActiveIntegration(n.targetIntegration);
                if (n.targetState) setState(n.targetState);
                onClose();
              }}
              style={{
                display: 'flex',
                gap: 8,
                padding: '8px 12px',
                width: '100%',
                background: n.read ? 'transparent' : 'rgba(255,255,255,0.03)',
                border: 'none',
                borderBottom: `0.5px solid ${colors.divider}`,
                cursor: 'pointer',
                textAlign: 'left',
                alignItems: 'flex-start',
              }}
            >
              {/* Severity dot */}
              <div style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: kindColor[n.kind] || colors.textTertiary,
                flexShrink: 0,
                marginTop: 4,
                opacity: n.read ? 0.4 : 1,
              }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11,
                  color: n.read ? colors.textTertiary : colors.textPrimary,
                  fontWeight: n.read ? 400 : 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {n.title}
                </div>
                <div style={{
                  fontSize: 10,
                  color: n.read ? 'rgba(255,255,255,0.2)' : colors.textSecondary,
                  fontFamily: fonts.mono,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: 1,
                }}>
                  {n.body.split('\n')[0]}
                </div>
              </div>

              {/* Time + sources */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                flexShrink: 0,
                gap: 2,
              }}>
                <span style={{
                  fontSize: 10,
                  color: colors.textTertiary,
                  fontFamily: fonts.mono,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {formatTimeAgo(n.timestamp)}
                </span>
                {!n.read && (
                  <div style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    backgroundColor: colors.info,
                  }} />
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function ChevronIcon({ size = 8 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" fill="currentColor" style={{ display: 'block' }}>
      <path d="M1.5 2.5L4 5.5L6.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NotchHeader() {
  const state = useVitalsStore((s) => s.state);
  const setState = useVitalsStore((s) => s.setState);
  const connectors = useVitalsStore((s) => s.connectors);
  const activeIntegration = useVitalsStore((s) => s.activeIntegration);
  const setActiveIntegration = useVitalsStore((s) => s.setActiveIntegration);
  const activeTab = useVitalsStore((s) => s.activeTab);
  const setActiveTab = useVitalsStore((s) => s.setActiveTab);
  const activeRepo = useVitalsStore((s) => s.activeRepo);
  const setActiveRepo = useVitalsStore((s) => s.setActiveRepo);
  const serviceErrors = useVitalsStore((s) => s.serviceErrors);
  const unreadCount = useVitalsStore((s) => s.unreadCount);
  const [showFeed, setShowFeed] = useState(false);
  const watchedRepos = useVitalsStore((s) => s.watchedRepos);
  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const repoPickerRef = useRef<HTMLDivElement>(null);

  // Close repo picker on click outside
  useEffect(() => {
    if (!showRepoPicker) return;
    function handleClick(e: MouseEvent) {
      if (repoPickerRef.current && !repoPickerRef.current.contains(e.target as Node)) {
        setShowRepoPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showRepoPicker]);

  const connectedIntegrations = connectors.filter((c) => c.connected);

  // Hide header entirely when nothing is connected
  if (connectedIntegrations.length === 0) {
    return null;
  }

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
      {(integrationTabs[activeIntegration] || []).length > 0 && (
        <div style={{ width: 1, height: 14, background: colors.divider, margin: '0 6px', flexShrink: 0, borderRadius: 1 }} />
      )}

      {/* Per-integration tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
        {(integrationTabs[activeIntegration] || []).map((tabId) => {
          const tabs = integrationTabs[activeIntegration] || [];
          const currentTab = activeTab || tabs[0] || '';
          const isActive = currentTab === tabId;
          return (
            <button
              key={tabId}
              onClick={() => setActiveTab(tabId)}
              style={{
                background: isActive ? 'rgba(255,255,255,0.08)' : 'none',
                border: 'none', borderRadius: 8,
                padding: '4px 9px', cursor: 'pointer',
                color: isActive ? colors.textPrimary : colors.textTertiary,
                fontSize: 12, transition: 'color 0.15s, background 0.15s',
              }}
            >
              {tabId}
            </button>
          );
        })}
      </div>

      {/* Repo picker — only for GitHub with multiple watched repos */}
      {activeIntegration === 'github' && watchedRepos.length > 1 && (
        <div style={{ position: 'relative', flexShrink: 0 }} ref={repoPickerRef}>
          <button
            onClick={() => setShowRepoPicker(!showRepoPicker)}
            style={{
              background: showRepoPicker ? 'rgba(255,255,255,0.08)' : 'none',
              border: 'none',
              borderRadius: 6,
              padding: '3px 6px',
              cursor: 'pointer',
              color: activeRepo ? colors.textPrimary : colors.textTertiary,
              fontSize: 11,
              fontFamily: fonts.mono,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              transition: 'color 0.15s, background 0.15s',
              maxWidth: 120,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeRepo ? activeRepo.split('/').pop() : 'all repos'}
            </span>
            <ChevronIcon />
          </button>

          {showRepoPicker && (
            <div style={{
              position: 'absolute',
              top: 28,
              right: 0,
              minWidth: 180,
              maxHeight: 220,
              overflowY: 'auto',
              background: '#1c1c1e',
              border: `0.5px solid ${colors.divider}`,
              borderRadius: 10,
              overflow: 'hidden',
              zIndex: 100,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}>
              <button
                onClick={() => { setActiveRepo(''); setShowRepoPicker(false); }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '7px 12px',
                  background: !activeRepo ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: 'none',
                  borderBottom: `0.5px solid ${colors.divider}`,
                  color: !activeRepo ? colors.action : colors.textPrimary,
                  fontSize: 11,
                  fontFamily: fonts.mono,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                all repos
              </button>
              {watchedRepos.map((wr) => (
                <button
                  key={wr.fullName}
                  onClick={() => { setActiveRepo(wr.fullName); setShowRepoPicker(false); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '7px 12px',
                    background: activeRepo === wr.fullName ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: 'none',
                    borderBottom: `0.5px solid ${colors.divider}`,
                    color: activeRepo === wr.fullName ? colors.action : colors.textPrimary,
                    fontSize: 11,
                    fontFamily: fonts.mono,
                    textAlign: 'left',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {wr.fullName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Refresh */}
      <RefreshButton />

      {/* Notification bell */}
      <button
        onClick={() => setShowFeed(!showFeed)}
        style={{
          background: showFeed ? 'rgba(255,255,255,0.08)' : 'none',
          border: 'none',
          borderRadius: 8,
          padding: 5,
          cursor: 'pointer',
          color: unreadCount > 0 ? colors.info : colors.textTertiary,
          display: 'flex',
          alignItems: 'center',
          transition: 'color 0.2s, transform 0.2s ease',
          flexShrink: 0,
          position: 'relative',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        title={unreadCount > 0 ? `${unreadCount} unread` : 'notifications'}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            minWidth: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: colors.incident,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 8,
            fontWeight: 700,
            color: '#fff',
            padding: '0 2px',
            fontFamily: fonts.mono,
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </div>
        )}
      </button>

      {/* Notification feed dropdown */}
      {showFeed && <NotificationFeed onClose={() => setShowFeed(false)} />}

      {/* Settings gear — opens separate window */}
      <button
        onClick={() => window.vitals.openSettings()}
        style={{
          background: 'none',
          border: 'none',
          borderRadius: 8,
          padding: 5,
          cursor: 'pointer',
          color: colors.textTertiary,
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
