import { useVitalsStore } from '../../store/useVitalsStore';
import { colors, fontSize, spacing, fonts } from '../../lib/design-tokens';
import { ShieldCheckIcon, AlertTriangleIcon, CIFailIcon } from '../ui/Icons';
import { SkeletonList, Skeleton } from '../ui/Skeleton';
import { formatTimeAgo } from '../../lib/utils';

function formatTimeAgoWithSuffix(dateStr: string): string {
  const short = formatTimeAgo(dateStr);
  return short === 'now' ? 'now' : `${short} ago`;
}

export function Anomaly() {
  const { hoverData, activeIntegration } = useVitalsStore();

  // GitHub anomalies
  const { github, vercel } = hoverData;
  const failedActions = github.actions.filter((a) => a.conclusion === 'failure');

  // Vercel anomalies
  const failedDeploys = (vercel?.deployments || []).filter((d) => d.state === 'ERROR' || d.state === 'CANCELED');
  const slowBuilds = (vercel?.deployments || []).filter((d) => {
    if (d.state !== 'BUILDING') return false;
    return (Date.now() - new Date(d.createdAt).getTime()) > 600_000; // 10min
  });
  const vercelWarnings = [...failedDeploys, ...slowBuilds];

  // Sentry anomalies
  const sentry = hoverData.sentry;
  const sentryAnomalies = (sentry?.issues || []).filter((issue) => issue.isNew || issue.isUnhandled);
  const hasSentryAnomalies = sentryAnomalies.length > 0;

  const hasGitHubAnomalies = failedActions.length > 0;
  const hasVercelAnomalies = vercelWarnings.length > 0;
  const lastPolledAt = useVitalsStore((s) => s.lastPolledAt);
  const connectors = useVitalsStore((s) => s.connectors);
  const isConnected = connectors.find((c) => c.id === activeIntegration)?.connected;

  const hasAnomalies = activeIntegration === 'vercel' ? hasVercelAnomalies
    : activeIntegration === 'github' ? hasGitHubAnomalies
    : activeIntegration === 'sentry' ? hasSentryAnomalies
    : false;

  // Loading skeleton
  if (isConnected && !lastPolledAt) {
    return (
      <div style={{ padding: `${spacing.panelPaddingY + 2}px ${spacing.panelPaddingX}px`, width: '100%', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: spacing.sectionGap }}>
          <Skeleton width={16} height={16} borderRadius={8} />
          <Skeleton width={180} height={14} />
        </div>
        <SkeletonList rows={3} />
      </div>
    );
  }

  if (!hasAnomalies) {
    return (
      <div style={{ padding: `${spacing.panelPaddingY}px ${spacing.panelPaddingX}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
        <ShieldCheckIcon size={20} />
        <span style={{ fontSize: fontSize.body, color: colors.textTertiary }}>
          no anomalies detected
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: `${spacing.panelPaddingY + 2}px ${spacing.panelPaddingX}px`,
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {/* GitHub anomalies */}
      {activeIntegration === 'github' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: spacing.sectionGap }}>
            <AlertTriangleIcon size={16} />
            <span style={{ fontSize: fontSize.title, color: colors.textPrimary }}>
              {failedActions.length} CI {failedActions.length === 1 ? 'failure' : 'failures'} detected
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lineGap }}>
            {failedActions.map((action, i, arr) => (
              <div
                key={`${action.sha}-${action.name}-${i}`}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  paddingBottom: spacing.lineGap + 2,
                  borderBottom: i < arr.length - 1 ? `0.5px solid ${colors.divider}` : 'none',
                }}
              >
                <div style={{ marginTop: 2 }}><CIFailIcon /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary,  }}>{action.repo}</span>
                    <span style={{ fontSize: fontSize.body, color: colors.anomaly }}>{action.name} failed</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <button
                      onClick={() => { if (action.repoFullName && action.fullSha.length > 7) window.vitals.openExternal(`https://github.com/${action.repoFullName}/commit/${action.fullSha}`); }}
                      style={{ background: colors.subtle, border: 'none', borderRadius: 6, padding: '1px 4px', fontSize: fontSize.labelSecondary, color: colors.textSecondary, fontFamily: fonts.mono, cursor: 'pointer' }}
                    >{action.sha}</button>
                    <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontFamily: fonts.mono }}>{action.branch}</span>
                  </div>
                </div>
                <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{formatTimeAgoWithSuffix(action.updatedAt)}</span>
              </div>
            ))}
          </div>

        </>
      )}

      {/* Sentry anomalies — new/unhandled issues */}
      {activeIntegration === 'sentry' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: spacing.sectionGap }}>
            <AlertTriangleIcon size={16} />
            <span style={{ fontSize: fontSize.title, color: colors.textPrimary }}>
              {sentryAnomalies.length} new {sentryAnomalies.length === 1 ? 'issue' : 'issues'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lineGap }}>
            {sentryAnomalies.map((issue, i, arr) => (
              <div
                key={issue.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  paddingBottom: spacing.lineGap + 2,
                  borderBottom: i < arr.length - 1 ? `0.5px solid ${colors.divider}` : 'none',
                }}
              >
                <div style={{ marginTop: 2 }}><AlertTriangleIcon size={13} color={issue.isUnhandled ? colors.incident : colors.anomaly} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: fontSize.body, color: issue.isUnhandled ? colors.incident : colors.anomaly, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {issue.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>{issue.project}</span>
                    <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontFamily: fonts.mono }}>{issue.count}x</span>
                    {issue.permalink && (
                      <button
                        onClick={() => window.vitals.openExternal(issue.permalink)}
                        style={{ background: colors.subtle, border: 'none', borderRadius: 6, padding: '1px 4px', fontSize: fontSize.labelSecondary, color: colors.action, cursor: 'pointer', marginLeft: 'auto' }}
                      >
                        view
                      </button>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{formatTimeAgoWithSuffix(issue.lastSeen)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Vercel anomalies — failed deploys & slow builds */}
      {activeIntegration === 'vercel' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: spacing.sectionGap }}>
            <AlertTriangleIcon size={16} />
            <span style={{ fontSize: fontSize.title, color: colors.textPrimary }}>
              {vercelWarnings.length} deploy {vercelWarnings.length === 1 ? 'warning' : 'warnings'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lineGap }}>
            {vercelWarnings.map((deploy, i, arr) => {
              const isSlow = deploy.state === 'BUILDING';
              return (
                <div
                  key={deploy.uid}
                  onClick={() => {
                    const url = deploy.inspectorUrl || deploy.url;
                    if (url) window.vitals.openExternal(url.startsWith('http') ? url : `https://${url}`);
                  }}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    paddingBottom: spacing.lineGap + 2,
                    borderBottom: i < arr.length - 1 ? `0.5px solid ${colors.divider}` : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ marginTop: 2 }}>
                    <AlertTriangleIcon size={13} color={isSlow ? colors.anomaly : colors.incident} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>{deploy.project}</span>
                      <span style={{ fontSize: fontSize.body, color: isSlow ? colors.anomaly : colors.incident }}>
                        {isSlow ? 'slow build' : 'deploy failed'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      {deploy.sha && (
                        <span style={{ background: colors.subtle, borderRadius: 6, padding: '1px 4px', fontSize: fontSize.labelSecondary, color: colors.textSecondary, fontFamily: fonts.mono }}>{deploy.sha}</span>
                      )}
                      {deploy.branch && (
                        <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontFamily: fonts.mono }}>{deploy.branch}</span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{formatTimeAgoWithSuffix(deploy.createdAt)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
