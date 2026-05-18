import { useVitalsStore } from '../../store/useVitalsStore';
import { colors, fontSize, spacing } from '../../lib/design-tokens';
import { SkeletonList, Skeleton } from '../ui/Skeleton';
import {
  GitHubHover,
  VercelHover,
  SentryHover,
  OpenAIHover,
  AnthropicHover,
  DatadogHover,
  SupabaseHover,
} from '../hover';
import { StreakBar } from '../hover/StreakBar';

export function Hover() {
  const { hoverData, connectors, activeIntegration } = useVitalsStore();
  const setState = useVitalsStore((s) => s.setState);
  const lastPolledAt = useVitalsStore((s) => s.lastPolledAt);

  const hasAnyConnected = connectors.some((c) => c.connected);

  // Nothing connected — show clear CTA to open settings
  if (!hasAnyConnected) {
    return (
      <div
        style={{
          padding: `24px 20px`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          width: '100%', height: '100%', gap: 12,
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: 20 }}>⚡</span>
        <span style={{ fontSize: fontSize.body, color: colors.textPrimary, fontWeight: 500 }}>
          Connect your first service
        </span>
        <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, lineHeight: 1.4 }}>
          Add GitHub, Vercel, Sentry and more to start monitoring.
        </span>
        <button
          onClick={() => setState('settings')}
          style={{
            marginTop: 4,
            background: colors.action, border: 'none', borderRadius: 8,
            color: '#000', fontSize: fontSize.body, fontWeight: 600,
            padding: '8px 18px', cursor: 'pointer',
          }}
        >
          Open Settings
        </button>
      </div>
    );
  }

  const isConnected = connectors.find((c) => c.id === activeIntegration)?.connected;

  const hasData = (() => {
    switch (activeIntegration) {
      case 'github': return hoverData.github.prs.length > 0 || hoverData.github.actions.length > 0 || hoverData.github.notifications.length > 0;
      case 'vercel': return hoverData.vercel != null && hoverData.vercel.deployments.length > 0;
      case 'sentry': return hoverData.sentry != null;
      case 'anthropic': return hoverData.anthropic?.data?.totals != null;
      default: return hoverData[activeIntegration as keyof typeof hoverData] != null && (hoverData[activeIntegration as keyof typeof hoverData] as any)?.data != null;
    }
  })();

  const isLoading = isConnected && !hasData && !lastPolledAt;

  // Loading skeleton
  if (isLoading) {
    return (
      <div style={{ padding: `${spacing.panelPaddingY}px ${spacing.panelPaddingX}px`, width: '100%', height: '100%' }}>
        <Skeleton width={80} height={10} style={{ marginBottom: spacing.sectionGap }} />
        <SkeletonList rows={4} />
        <div style={{ marginTop: spacing.sectionGap, display: 'flex', gap: 14 }}>
          <Skeleton width={60} height={24} borderRadius={8} />
          <Skeleton width={60} height={24} borderRadius={8} />
          <Skeleton width={60} height={24} borderRadius={8} />
        </div>
      </div>
    );
  }

  // Empty state
  if (!hasData) {
    return (
      <div
        style={{
          padding: `${spacing.panelPaddingY}px ${spacing.panelPaddingX}px`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          width: '100%', height: '100%', gap: 8,
        }}
      >
        <div style={{ fontSize: fontSize.body, color: colors.textTertiary }}>
          {!isConnected
            ? `connect ${activeIntegration} to see data`
            : 'no data available'}
        </div>
        {!isConnected && (
          <button
            onClick={() => setState('settings')}
            style={{
              background: colors.subtle, border: 'none', borderRadius: 8,
              color: colors.action, fontSize: fontSize.labelSecondary,
              padding: '4px 12px', cursor: 'pointer',
            }}
          >
            open settings
          </button>
        )}
      </div>
    );
  }

  // Route to per-integration hover component
  const content = (() => {
    switch (activeIntegration) {
      case 'github':
        return <GitHubHover data={hoverData.github} />;
      case 'vercel':
        return <VercelHover data={hoverData.vercel!} />;
      case 'sentry':
        return <SentryHover data={hoverData.sentry!} />;
      case 'openai':
        return <OpenAIHover data={hoverData.openai!.data} />;
      case 'anthropic':
        return <AnthropicHover data={hoverData.anthropic!.data} />;
      case 'datadog':
        return <DatadogHover data={hoverData.datadog!.data} />;
      case 'supabase':
        return <SupabaseHover data={hoverData.supabase!.data} />;
      default:
        return null;
    }
  })();

  return (
    <>
      <StreakBar />
      {content}
    </>
  );
}
