import { useState } from 'react';
import { useVitalsStore } from '../../store/useVitalsStore';
import { colors, fontSize, spacing, fonts } from '../../lib/design-tokens';
import { SkeletonList, Skeleton } from '../ui/Skeleton';

type EnvFilter = 'all' | 'production' | 'preview';

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function StatusDot({ color }: { color: string }) {
  return <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />;
}

function prColor(status: string): string {
  if (status === 'approved') return colors.healthy;
  if (status === 'needs_review') return colors.anomaly;
  if (status === 'draft') return colors.textTertiary;
  return colors.incident;
}

function ciColor(conclusion: string | null): string {
  if (conclusion === 'success') return colors.healthy;
  if (conclusion === 'failure') return colors.incident;
  return colors.anomaly;
}

function deployStateColor(state: string): string {
  if (state === 'READY') return colors.healthy;
  if (state === 'ERROR' || state === 'CANCELED') return colors.incident;
  return colors.anomaly; // BUILDING, QUEUED, INITIALIZING
}

function deployStateLabel(state: string): string {
  if (state === 'READY') return 'ready';
  if (state === 'ERROR') return 'error';
  if (state === 'BUILDING') return 'building';
  if (state === 'CANCELED') return 'canceled';
  if (state === 'QUEUED') return 'queued';
  return state.toLowerCase();
}

export function Hover() {
  const { hoverData, connectors, activeIntegration } = useVitalsStore();
  const setState = useVitalsStore((s) => s.setState);
  const { github, vercel } = hoverData;
  const githubConnected = connectors.find((c) => c.id === 'github')?.connected;
  const vercelConnected = connectors.find((c) => c.id === 'vercel')?.connected;

  const [envFilter, setEnvFilter] = useState<EnvFilter>('all');

  const hasPRs = github.prs.length > 0;
  const hasActions = github.actions.length > 0;
  const hasCommits = (github.commits || []).length > 0;
  const hasGitHubData = hasPRs || hasActions || hasCommits;
  const hasVercelData = vercel && vercel.deployments.length > 0;
  const lastPolledAt = useVitalsStore((s) => s.lastPolledAt);

  const isConnected = activeIntegration === 'vercel' ? vercelConnected : githubConnected;
  const hasData = activeIntegration === 'vercel' ? hasVercelData : hasGitHubData;
  const isLoading = isConnected && !hasData && !lastPolledAt;

  // Loading skeleton
  if (isLoading) {
    return (
      <div style={{ padding: `${spacing.panelPaddingY}px ${spacing.panelPaddingX}px`, width: '100%', height: '100%' }}>
        <Skeleton width={80} height={10} style={{ marginBottom: spacing.sectionGap }} />
        <SkeletonList rows={4} />
        <div style={{ marginTop: spacing.sectionGap, display: 'flex', gap: 14 }}>
          <Skeleton width={60} height={24} borderRadius={4} />
          <Skeleton width={60} height={24} borderRadius={4} />
          <Skeleton width={60} height={24} borderRadius={4} />
        </div>
      </div>
    );
  }

  // Empty state — no data at all
  if (!hasData) {
    return (
      <div
        style={{
          padding: `${spacing.panelPaddingY}px ${spacing.panelPaddingX}px`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          gap: 8,
        }}
      >
        <div style={{ fontSize: fontSize.body, color: colors.textTertiary }}>
          {activeIntegration === 'vercel'
            ? (!vercelConnected ? 'connect vercel to see deploys' : 'no recent deploys')
            : (!githubConnected ? 'connect github to see your repos' : 'no activity on watched repos')}
        </div>
        {(!githubConnected || (activeIntegration === 'vercel' && !vercelConnected)) && (
          <button
            onClick={() => setState('settings')}
            style={{
              background: colors.subtle,
              border: 'none',
              borderRadius: 5,
              color: colors.action,
              fontSize: fontSize.labelSecondary,
              padding: '4px 12px',
              cursor: 'pointer',
            }}
          >
            open settings
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        padding: `${spacing.panelPaddingY}px ${spacing.panelPaddingX}px`,
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        gap: 0,
        overflowY: 'auto',
      }}
    >
      {/* pull requests */}
      {activeIntegration === 'github' && hasPRs && (
        <div style={{ marginBottom: spacing.sectionGap - 2 }}>
          <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, textTransform: 'lowercase', marginBottom: spacing.lineGap }}>
            pull requests
          </div>
          {github.prs.slice(0, 4).map((pr, i, arr) => (
            <div
              key={pr.number}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                paddingBottom: i < arr.length - 1 ? spacing.lineGap : 0,
                borderBottom: i < arr.length - 1 ? `0.5px solid ${colors.divider}` : 'none',
                marginBottom: i < arr.length - 1 ? spacing.lineGap : 0,
              }}
            >
              <StatusDot color={prColor(pr.status)} />
              <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, flexShrink: 0 }}>
                {pr.repo}
              </span>
              <span
                style={{
                  fontSize: fontSize.body,
                  color: colors.textPrimary,
                  flex: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {pr.title}
              </span>
              <span
                style={{
                  fontSize: fontSize.labelSecondary,
                  color: colors.textTertiary,
                  fontFamily: fonts.mono,
                  background: colors.subtle,
                  padding: '1px 4px',
                  borderRadius: 3,
                  flexShrink: 0,
                  maxWidth: 110,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {pr.branch}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* actions */}
      {activeIntegration === 'github' && hasActions && (
        <div
          style={{
            marginBottom: spacing.sectionGap - 2,
            paddingTop: hasPRs ? spacing.sectionGap - 2 : 0,
            borderTop: hasPRs ? `0.5px solid ${colors.divider}` : 'none',
          }}
        >
          <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, textTransform: 'lowercase', marginBottom: spacing.lineGap }}>
            actions
          </div>
          {github.actions.slice(0, 4).map((run, i, arr) => (
            <div
              key={`${run.sha}-${run.name}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                paddingBottom: i < arr.length - 1 ? spacing.lineGap : 0,
                borderBottom: i < arr.length - 1 ? `0.5px solid ${colors.divider}` : 'none',
                marginBottom: i < arr.length - 1 ? spacing.lineGap : 0,
              }}
            >
              <StatusDot color={ciColor(run.conclusion)} />
              <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, flexShrink: 0 }}>
                {run.repo}
              </span>
              <span style={{ fontSize: fontSize.body, color: colors.textPrimary, flexShrink: 0 }}>
                {run.name}
              </span>
              <span
                style={{
                  fontSize: fontSize.labelSecondary,
                  color: colors.textTertiary,
                  fontFamily: fonts.mono,
                  background: colors.subtle,
                  padding: '1px 4px',
                  borderRadius: 3,
                }}
              >
                {run.sha}
              </span>
              <span
                style={{
                  fontSize: fontSize.labelSecondary,
                  color: colors.textTertiary,
                  fontFamily: fonts.mono,
                  background: colors.subtle,
                  padding: '1px 4px',
                  borderRadius: 3,
                  maxWidth: 90,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {run.branch}
              </span>
              <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 'auto' }}>
                {formatTimeAgo(run.updatedAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* recent commits */}
      {activeIntegration === 'github' && hasCommits && (
        <div
          style={{
            marginBottom: spacing.sectionGap - 2,
            paddingTop: (hasPRs || hasActions) ? spacing.sectionGap - 2 : 0,
            borderTop: (hasPRs || hasActions) ? `0.5px solid ${colors.divider}` : 'none',
          }}
        >
          <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, textTransform: 'lowercase', marginBottom: spacing.lineGap }}>
            recent commits
          </div>
          {(github.commits || []).slice(0, 4).map((commit, i, arr) => (
            <div
              key={`${commit.fullSha}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                paddingBottom: i < arr.length - 1 ? spacing.lineGap : 0,
                borderBottom: i < arr.length - 1 ? `0.5px solid ${colors.divider}` : 'none',
                marginBottom: i < arr.length - 1 ? spacing.lineGap : 0,
              }}
            >
              <StatusDot color={colors.healthy} />
              <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, flexShrink: 0 }}>
                {commit.repo}
              </span>
              <button
                onClick={() => {
                  if (commit.repoFullName && commit.fullSha.length > 7) {
                    window.vitals.openExternal(`https://github.com/${commit.repoFullName}/commit/${commit.fullSha}`);
                  }
                }}
                style={{
                  background: colors.subtle,
                  border: 'none',
                  borderRadius: 3,
                  padding: '1px 4px',
                  fontSize: fontSize.labelSecondary,
                  color: colors.textSecondary,
                  fontFamily: fonts.mono,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {commit.sha}
              </button>
              <span
                style={{
                  fontSize: fontSize.body,
                  color: colors.textPrimary,
                  flex: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {commit.message}
              </span>
              <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {formatTimeAgo(commit.date)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* vercel deploys */}
      {activeIntegration === 'vercel' && hasVercelData && (() => {
        const filtered = envFilter === 'all'
          ? vercel!.deployments
          : vercel!.deployments.filter((d) => d.target === envFilter);
        return (
        <div style={{ marginBottom: spacing.sectionGap - 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lineGap }}>
            <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, textTransform: 'lowercase' }}>
              deploys
            </span>
            <div style={{ display: 'flex', gap: 3 }}>
              {(['all', 'production', 'preview'] as EnvFilter[]).map((env) => (
                <button
                  key={env}
                  onClick={() => setEnvFilter(env)}
                  style={{
                    background: envFilter === env ? 'rgba(255,255,255,0.12)' : colors.subtle,
                    border: 'none',
                    borderRadius: 3,
                    color: envFilter === env ? colors.action : colors.textTertiary,
                    fontSize: fontSize.labelSecondary,
                    padding: '1px 6px',
                    cursor: 'pointer',
                  }}
                >
                  {env === 'production' ? 'prod' : env}
                </button>
              ))}
            </div>
          </div>
          {filtered.slice(0, 6).map((deploy, i, arr) => (
            <div
              key={deploy.uid}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                paddingBottom: i < arr.length - 1 ? spacing.lineGap : 0,
                borderBottom: i < arr.length - 1 ? `0.5px solid ${colors.divider}` : 'none',
                marginBottom: i < arr.length - 1 ? spacing.lineGap : 0,
              }}
            >
              <StatusDot color={deployStateColor(deploy.state)} />
              <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, flexShrink: 0 }}>
                {deploy.project}
              </span>
              <span style={{ fontSize: fontSize.labelSecondary, color: deployStateColor(deploy.state), flexShrink: 0 }}>
                {deployStateLabel(deploy.state)}
              </span>
              {deploy.sha && (
                <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontFamily: fonts.mono, background: colors.subtle, padding: '1px 4px', borderRadius: 3 }}>
                  {deploy.sha}
                </span>
              )}
              <button
                onClick={() => {
                  const url = deploy.inspectorUrl || deploy.url;
                  if (url) window.vitals.openExternal(url.startsWith('http') ? url : `https://${url}`);
                }}
                style={{
                  background: colors.subtle,
                  border: 'none',
                  borderRadius: 3,
                  padding: '1px 4px',
                  fontSize: fontSize.labelSecondary,
                  color: colors.action,
                  fontFamily: fonts.mono,
                  cursor: 'pointer',
                  flexShrink: 0,
                  marginLeft: 'auto',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 120,
                }}
              >
                {deploy.target === 'production' ? 'prod' : 'preview'}
              </button>
              <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {formatTimeAgo(deploy.createdAt)}
              </span>
            </div>
          ))}
        </div>
        );
      })()}

      {/* bottom summary */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: spacing.sectionGap - 2,
          borderTop: `0.5px solid ${colors.divider}`,
          display: 'flex',
          gap: 14,
        }}
      >
        <div>
          <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>error rate</span>
          <div style={{ fontSize: fontSize.bodyLarge, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
            {hoverData.errorRate.value}
          </div>
        </div>
        <div>
          <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>conversion</span>
          <div style={{ fontSize: fontSize.bodyLarge, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
            {hoverData.conversion.value}
          </div>
        </div>
        <div>
          <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>events/min</span>
          <div style={{ fontSize: fontSize.bodyLarge, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
            {hoverData.eventsPerMin.value}
          </div>
        </div>
        {github.notifications > 0 && (
          <div style={{ marginLeft: 'auto' }}>
            <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>notifications</span>
            <div style={{ fontSize: fontSize.bodyLarge, color: colors.action, fontVariantNumeric: 'tabular-nums' }}>
              {github.notifications}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
