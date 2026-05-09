import { useState } from 'react';
import { useVitalsStore } from '../../store/useVitalsStore';
import { colors, fontSize, spacing, fonts } from '../../lib/design-tokens';
import { SkeletonList, Skeleton } from '../ui/Skeleton';
import { formatTimeAgo } from '../../lib/utils';
import type { SentryData } from '../../store/types';

type EnvFilter = 'all' | 'production' | 'preview';

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
  const activeConnected = connectors.find((c) => c.id === activeIntegration)?.connected;

  const [envFilter, setEnvFilter] = useState<EnvFilter>('all');

  const hasPRs = github.prs.length > 0;
  const hasActions = github.actions.length > 0;
  const hasCommits = (github.commits || []).length > 0;
  const hasGitHubData = hasPRs || hasActions || hasCommits;
  const hasVercelData = vercel && vercel.deployments.length > 0;
  const sentryConnected = connectors.find((c) => c.id === 'sentry')?.connected;
  const sentry = hoverData.sentry;
  const hasSentryData = sentry != null;
  const lastPolledAt = useVitalsStore((s) => s.lastPolledAt);

  // Generic service data
  const genericServices = ['openai', 'datadog', 'posthog', 'segment'] as const;
  const isGenericService = genericServices.includes(activeIntegration as any);
  const serviceSnapshot = isGenericService ? hoverData[activeIntegration as typeof genericServices[number]] : null;
  const hasServiceData = serviceSnapshot?.data != null;

  // Anthropic (Claude Code) data
  const isAnthropic = activeIntegration === 'anthropic';
  const anthropicSnapshot = isAnthropic ? hoverData.anthropic : null;
  const hasAnthropicData = anthropicSnapshot?.data?.totals != null;

  // Chrome data
  const isChrome = activeIntegration === 'chrome';
  const chromeSnapshot = isChrome ? hoverData.chrome : null;
  const hasChromeData = chromeSnapshot?.data != null;

  const isSentry = activeIntegration === 'sentry';

  const isConnected = activeIntegration === 'vercel' ? vercelConnected
    : activeIntegration === 'github' ? githubConnected
    : activeIntegration === 'sentry' ? sentryConnected
    : activeConnected;
  const hasData = activeIntegration === 'vercel' ? hasVercelData
    : activeIntegration === 'github' ? hasGitHubData
    : activeIntegration === 'sentry' ? hasSentryData
    : isChrome ? hasChromeData
    : isAnthropic ? hasAnthropicData
    : hasServiceData;
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
          {!isConnected
            ? `connect ${activeIntegration} to see data`
            : activeIntegration === 'vercel'
              ? 'no recent deploys'
              : activeIntegration === 'github'
                ? 'no activity on watched repos'
                : activeIntegration === 'sentry'
                  ? 'waiting for sentry data — check token permissions'
                  : 'no data available'}
        </div>
        {!isConnected && (
          <button
            onClick={() => setState('settings')}
            style={{
              background: colors.subtle,
              border: 'none',
              borderRadius: 8,
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
          <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, marginBottom: spacing.lineGap }}>
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
                  borderRadius: 6,
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
          <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, marginBottom: spacing.lineGap }}>
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
                  borderRadius: 6,
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
                  borderRadius: 6,
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
          <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, marginBottom: spacing.lineGap }}>
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
                  borderRadius: 6,
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
                    borderRadius: 6,
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
                  borderRadius: 6,
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

      {/* Sentry issues */}
      {isSentry && hasSentryData && (
        <SentryView data={sentry!} />
      )}

      {/* Claude Code analytics */}
      {isAnthropic && hasAnthropicData && (
        <ClaudeCodeView data={anthropicSnapshot!.data} />
      )}

      {/* Generic service data (OpenAI, Datadog, PostHog, Segment) */}
      {isGenericService && hasServiceData && (
        <GenericServiceView service={activeIntegration} data={serviceSnapshot!.data} />
      )}

      {/* Chrome logs */}
      {isChrome && hasChromeData && (
        <ChromeLogsView data={chromeSnapshot!.data} />
      )}

      {/* bottom summary — contextual per integration */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: spacing.sectionGap - 2,
          borderTop: `0.5px solid ${colors.divider}`,
          display: 'flex',
          gap: 14,
        }}
      >
        {activeIntegration === 'github' && (() => {
          const openPRs = github.prs.length;
          const needsReview = github.prs.filter((p) => p.status === 'needs_review').length;
          const failedRuns = github.actions.filter((a) => a.conclusion === 'failure').length;
          const passingRuns = github.actions.filter((a) => a.conclusion === 'success').length;
          const totalRuns = github.actions.length;
          const commitCount = (github.commits || []).length;
          return (
            <>
              <div>
                <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>PRs</span>
                <div style={{ fontSize: fontSize.bodyLarge, color: needsReview > 0 ? colors.anomaly : colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                  {openPRs}{needsReview > 0 ? <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}> · {needsReview} review</span> : null}
                </div>
              </div>
              <div>
                <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>CI</span>
                <div style={{ fontSize: fontSize.bodyLarge, color: failedRuns > 0 ? colors.incident : colors.healthy, fontVariantNumeric: 'tabular-nums' }}>
                  {failedRuns > 0 ? `${failedRuns} failed` : totalRuns > 0 ? `${passingRuns}/${totalRuns}` : '—'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>commits</span>
                <div style={{ fontSize: fontSize.bodyLarge, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                  {commitCount}
                </div>
              </div>
            </>
          );
        })()}
        {activeIntegration === 'vercel' && hasVercelData && (() => {
          const deploys = vercel!.deployments;
          const ready = deploys.filter((d) => d.state === 'READY').length;
          const errors = deploys.filter((d) => d.state === 'ERROR').length;
          const building = deploys.filter((d) => d.state === 'BUILDING' || d.state === 'QUEUED').length;
          return (
            <>
              <div>
                <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>ready</span>
                <div style={{ fontSize: fontSize.bodyLarge, color: colors.healthy, fontVariantNumeric: 'tabular-nums' }}>{ready}</div>
              </div>
              {errors > 0 && (
                <div>
                  <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>errors</span>
                  <div style={{ fontSize: fontSize.bodyLarge, color: colors.incident, fontVariantNumeric: 'tabular-nums' }}>{errors}</div>
                </div>
              )}
              {building > 0 && (
                <div>
                  <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>building</span>
                  <div style={{ fontSize: fontSize.bodyLarge, color: colors.anomaly, fontVariantNumeric: 'tabular-nums' }}>{building}</div>
                </div>
              )}
              <div>
                <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>projects</span>
                <div style={{ fontSize: fontSize.bodyLarge, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{vercel!.projects.length}</div>
              </div>
            </>
          );
        })()}
        {activeIntegration === 'sentry' && hasSentryData && (() => {
          const { totalErrors24h, unresolvedCount, newIssues24h } = sentry!.stats;
          return (
            <>
              <div>
                <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>Errors 24h</span>
                <div style={{ fontSize: fontSize.bodyLarge, color: totalErrors24h > 100 ? colors.incident : colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                  {totalErrors24h > 1000 ? `${(totalErrors24h / 1000).toFixed(1)}k` : totalErrors24h}
                </div>
              </div>
              <div>
                <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>Unresolved</span>
                <div style={{ fontSize: fontSize.bodyLarge, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{unresolvedCount}</div>
              </div>
              {newIssues24h > 0 && (
                <div>
                  <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>New 24h</span>
                  <div style={{ fontSize: fontSize.bodyLarge, color: colors.anomaly, fontVariantNumeric: 'tabular-nums' }}>{newIssues24h}</div>
                </div>
              )}
            </>
          );
        })()}
        {activeIntegration !== 'github' && activeIntegration !== 'vercel' && activeIntegration !== 'sentry' && (
          <>
            <div>
              <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>error rate</span>
              <div style={{ fontSize: fontSize.bodyLarge, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{hoverData.errorRate.value}</div>
            </div>
            <div>
              <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>conversion</span>
              <div style={{ fontSize: fontSize.bodyLarge, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{hoverData.conversion.value}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Chrome logs view with level filter
type LogLevel = 'all' | 'error' | 'warning' | 'log' | 'info';

const SENTRY_PERIOD_OPTIONS = [
  { label: '1d', days: 1 },
  { label: '3d', days: 3 },
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
];

function SentryView({ data }: { data: SentryData }) {
  const [projectFilter, setProjectFilter] = useState('all');
  const [periodDays, setPeriodDays] = useState(7);

  const levelColor = (level: string) =>
    level === 'error' || level === 'fatal' ? colors.incident : colors.anomaly;

  const projects = [...new Set(data.issues.map((i) => i.project))];
  const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;

  const filtered = data.issues
    .filter((i) => projectFilter === 'all' || i.project === projectFilter)
    .filter((i) => new Date(i.lastSeen).getTime() > cutoff);

  return (
    <div style={{ marginBottom: spacing.sectionGap - 2 }}>
      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lineGap }}>
        <div style={{ display: 'flex', gap: 3 }}>
          <button
            onClick={() => setProjectFilter('all')}
            style={{
              background: projectFilter === 'all' ? 'rgba(255,255,255,0.12)' : colors.subtle,
              border: 'none', borderRadius: 6, fontSize: fontSize.labelSecondary, fontFamily: fonts.mono,
              color: projectFilter === 'all' ? colors.action : colors.textTertiary,
              padding: '2px 6px', cursor: 'pointer',
            }}
          >all</button>
          {projects.map((p) => (
            <button
              key={p}
              onClick={() => setProjectFilter(p)}
              style={{
                background: projectFilter === p ? 'rgba(255,255,255,0.12)' : colors.subtle,
                border: 'none', borderRadius: 6, fontSize: fontSize.labelSecondary, fontFamily: fonts.mono,
                color: projectFilter === p ? colors.action : colors.textTertiary,
                padding: '2px 6px', cursor: 'pointer',
                maxWidth: 90, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >{p}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {SENTRY_PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setPeriodDays(opt.days)}
              style={{
                background: periodDays === opt.days ? 'rgba(255,255,255,0.12)' : colors.subtle,
                border: 'none', borderRadius: 6, fontSize: fontSize.labelSecondary,
                color: periodDays === opt.days ? colors.action : colors.textTertiary,
                padding: '2px 6px', cursor: 'pointer', fontVariantNumeric: 'tabular-nums',
              }}
            >{opt.label}</button>
          ))}
        </div>
      </div>

      {/* Issues */}
      {filtered.length === 0 ? (
        <div style={{ fontSize: fontSize.body, color: colors.textTertiary, textAlign: 'center', padding: 16 }}>
          no issues in the last {periodDays}d
        </div>
      ) : filtered.slice(0, 6).map((issue, i, arr) => (
        <div
          key={issue.id}
          onClick={() => { if (issue.permalink) window.vitals.openExternal(issue.permalink); }}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            paddingBottom: i < arr.length - 1 ? spacing.lineGap : 0,
            borderBottom: i < arr.length - 1 ? `0.5px solid ${colors.divider}` : 'none',
            marginBottom: i < arr.length - 1 ? spacing.lineGap : 0,
            cursor: issue.permalink ? 'pointer' : 'default',
          }}
        >
          <StatusDot color={levelColor(issue.level)} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontSize: fontSize.body,
                color: colors.textPrimary,
                display: 'block',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {issue.title}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>{issue.project}</span>
              <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontFamily: fonts.mono }}>{issue.count}x</span>
              {issue.isNew && (
                <span style={{ fontSize: 10, color: colors.info, background: 'rgba(96,165,250,0.12)', padding: '1px 4px', borderRadius: 4 }}>new</span>
              )}
              {issue.isUnhandled && (
                <span style={{ fontSize: 10, color: colors.incident, background: 'rgba(239,68,68,0.12)', padding: '1px 4px', borderRadius: 4 }}>unhandled</span>
              )}
            </div>
          </div>
          <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {formatTimeAgo(issue.lastSeen)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChromeLogsView({ data }: { data: any }) {
  const [filter, setFilter] = useState<LogLevel>('all');
  const consoleLogs: Array<{ timestamp: number; level: string; text: string }> = data?.console || [];
  const stats = data?.stats || {};

  const filtered = filter === 'all'
    ? consoleLogs
    : consoleLogs.filter((e) => e.level === filter);

  const tabTitle = data?.tabTitle || '';
  const tabUrl = data?.tabUrl || '';
  const tabHost = (() => { try { return new URL(tabUrl).host; } catch { return tabUrl; } })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab info */}
      {tabTitle && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: spacing.lineGap, overflow: 'hidden' }}>
          <span style={{ fontSize: fontSize.labelSecondary, color: colors.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tabTitle}
          </span>
          <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontFamily: fonts.mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>
            {tabHost}
          </span>
        </div>
      )}
      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lineGap }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {(['all', 'error', 'warning', 'log', 'info'] as LogLevel[]).map((lvl) => {
            const count = lvl === 'all' ? consoleLogs.length
              : consoleLogs.filter((e) => e.level === lvl).length;
            const active = filter === lvl;
            return (
              <button
                key={lvl}
                onClick={() => setFilter(lvl)}
                style={{
                  background: active ? 'rgba(255,255,255,0.12)' : colors.subtle,
                  border: 'none',
                  borderRadius: 6,
                  color: active
                    ? (lvl === 'error' ? colors.incident : lvl === 'warning' ? colors.anomaly : colors.action)
                    : colors.textTertiary,
                  fontSize: fontSize.labelSecondary,
                  fontFamily: fonts.mono,
                  padding: '2px 6px',
                  cursor: 'pointer',
                }}
              >
                {lvl}{count > 0 ? ` ${count}` : ''}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: fontSize.labelSecondary }}>
          {stats.errors > 0 && <span style={{ color: colors.incident }}>{stats.errors} err</span>}
          {stats.warnings > 0 && <span style={{ color: colors.anomaly }}>{stats.warnings} warn</span>}
        </div>
      </div>

      {/* Log entries */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: fontSize.body, color: colors.textTertiary, textAlign: 'center', paddingTop: 20 }}>
            {consoleLogs.length === 0 ? 'no console output yet' : `no ${filter} entries`}
          </div>
        ) : (
          filtered.slice(-25).reverse().map((entry, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 6,
                alignItems: 'flex-start',
                paddingBottom: 3,
                marginBottom: 3,
                borderBottom: `0.5px solid ${colors.divider}`,
              }}
            >
              <span style={{
                fontSize: fontSize.labelSecondary,
                color: entry.level === 'error' ? colors.incident
                  : entry.level === 'warning' ? colors.anomaly
                  : colors.textTertiary,
                flexShrink: 0,
                width: 32,
                fontFamily: fonts.mono,
              }}>
                {entry.level === 'error' ? 'ERR' : entry.level === 'warning' ? 'WARN' : entry.level === 'info' ? 'INFO' : 'LOG'}
              </span>
              <span style={{
                fontSize: fontSize.labelSecondary,
                color: entry.level === 'error' ? colors.incident : colors.textPrimary,
                fontFamily: fonts.mono,
                flex: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {entry.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Claude Code analytics view
function ClaudeCodeView({ data }: { data: any }) {
  const totals = data?.totals;
  if (!totals) return null;

  const costDollars = (totals.totalCostCents || 0) / 100;
  const acceptRate = totals.editAcceptRate;
  const models = totals.models || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sectionGap - 2 }}>
      {/* Top stats */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <StatCell label="sessions" value={String(totals.sessions || 0)} />
        <StatCell label="lines +" value={formatNum(totals.linesAdded || 0)} color={colors.healthy} />
        <StatCell label="lines −" value={formatNum(totals.linesRemoved || 0)} color={colors.incident} />
        <StatCell label="commits" value={String(totals.commits || 0)} />
        <StatCell label="PRs" value={String(totals.pullRequests || 0)} />
      </div>

      {/* Cost + accept rate */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          paddingTop: spacing.lineGap,
          borderTop: `0.5px solid ${colors.divider}`,
        }}
      >
        <StatCell label="est. cost (7d)" value={`$${costDollars.toFixed(2)}`} />
        {acceptRate !== null && (
          <StatCell
            label="accept rate"
            value={`${acceptRate}%`}
            color={acceptRate >= 70 ? colors.healthy : acceptRate >= 50 ? colors.anomaly : colors.incident}
          />
        )}
        <StatCell label="input tokens" value={formatNum(totals.totalInputTokens || 0)} />
        <StatCell label="output tokens" value={formatNum(totals.totalOutputTokens || 0)} />
      </div>

      {/* Model breakdown */}
      {models.length > 0 && (
        <div style={{ paddingTop: spacing.lineGap, borderTop: `0.5px solid ${colors.divider}` }}>
          <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, marginBottom: spacing.lineGap }}>
            models (7d)
          </div>
          {models.map((m: any, i: number) => (
            <div
              key={m.model}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: i < models.length - 1 ? spacing.lineGap : 0,
                marginBottom: i < models.length - 1 ? spacing.lineGap : 0,
                borderBottom: i < models.length - 1 ? `0.5px solid ${colors.divider}` : 'none',
              }}
            >
              <span style={{ fontSize: fontSize.labelSecondary, color: colors.textPrimary, fontFamily: fonts.mono }}>
                {m.model}
              </span>
              <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontVariantNumeric: 'tabular-nums' }}>
                ${((m.estimatedCostCents || 0) / 100).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>{label}</span>
      <div style={{ fontSize: fontSize.bodyLarge, color: color || colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// Generic view for services that don't have custom UI yet
function GenericServiceView({ service, data }: { service: string; data: any }) {
  if (!data || typeof data !== 'object') return null;

  // Try to render known data shapes
  const entries = flattenData(data, '', 12);

  return (
    <div style={{ marginBottom: spacing.sectionGap - 2 }}>
      <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, marginBottom: spacing.lineGap }}>
        {service}
      </div>
      {entries.map(({ key, value }, i) => (
        <div
          key={key}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            paddingBottom: i < entries.length - 1 ? spacing.lineGap : 0,
            borderBottom: i < entries.length - 1 ? `0.5px solid ${colors.divider}` : 'none',
            marginBottom: i < entries.length - 1 ? spacing.lineGap : 0,
          }}
        >
          <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontFamily: fonts.mono }}>
            {key}
          </span>
          <span style={{ fontSize: fontSize.body, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums', textAlign: 'right', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function flattenData(obj: any, prefix: string, maxItems: number): Array<{ key: string; value: string }> {
  const result: Array<{ key: string; value: string }> = [];
  if (!obj || typeof obj !== 'object') return result;

  for (const [k, v] of Object.entries(obj)) {
    if (result.length >= maxItems) break;
    const key = prefix ? `${prefix}.${k}` : k;

    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      result.push({ key, value: `[${v.length} items]` });
    } else if (typeof v === 'object') {
      result.push(...flattenData(v, key, maxItems - result.length));
    } else {
      result.push({ key, value: String(v) });
    }
  }
  return result;
}
