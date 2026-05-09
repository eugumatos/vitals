import { useState } from 'react';
import { useVitalsStore } from '../../store/useVitalsStore';
import { colors, fontSize, spacing, fonts } from '../../lib/design-tokens';
import { ShieldCheckIcon, AlertTriangleIcon, CIFailIcon, CommitIcon } from '../ui/Icons';
import { SkeletonList, Skeleton } from '../ui/Skeleton';
import { formatTimeAgo } from '../../lib/utils';

type NetworkFilter = 'all' | 'xhr' | 'doc' | 'css' | 'js' | 'img' | 'other' | 'failed';

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function buildCurl(req: { method: string; url: string; requestHeaders?: Record<string, string>; postData?: string }): string {
  const parts: string[] = ['curl', shellEscape(req.url)];
  if (req.method !== 'GET') parts.push('-X', req.method);
  const headers = req.requestHeaders || {};
  for (const [k, v] of Object.entries(headers)) {
    if (k.startsWith(':')) continue;
    parts.push('-H', shellEscape(`${k}: ${v}`));
  }
  if (req.postData) {
    parts.push('--data-raw', shellEscape(req.postData));
  }
  return parts.join(' \\\n  ');
}

function CopyCurlButton({ req }: { req: { method: string; url: string; requestHeaders?: Record<string, string>; postData?: string } }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(buildCurl(req));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{
        background: colors.subtle,
        border: 'none',
        borderRadius: 6,
        color: copied ? colors.healthy : colors.textTertiary,
        fontSize: 10,
        fontFamily: fonts.mono,
        padding: '1px 4px',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'color 0.15s',
      }}
      title="copy as cURL"
    >
      {copied ? '✓' : 'curl'}
    </button>
  );
}

function ChromeNetworkView({ data }: { data: any }) {
  const [filter, setFilter] = useState<NetworkFilter>('all');
  const networkReqs: Array<{ timestamp: number; method: string; url: string; status: number | null; duration: number | null; type: string; failed: boolean; error?: string; size: number | null; requestHeaders?: Record<string, string>; postData?: string }> = data?.network || [];
  const stats = data?.stats || {};

  const typeMap: Record<string, NetworkFilter> = {
    XHR: 'xhr', Fetch: 'xhr',
    Document: 'doc',
    Stylesheet: 'css',
    Script: 'js',
    Image: 'img', Media: 'img', Font: 'img',
  };

  const filtered = filter === 'all' ? networkReqs
    : filter === 'failed' ? networkReqs.filter((r) => r.failed || (r.status && r.status >= 400))
    : networkReqs.filter((r) => (typeMap[r.type] || 'other') === filter);

  const tabTitle = data?.tabTitle || '';
  const tabUrl = data?.tabUrl || '';
  const tabHost = (() => { try { return new URL(tabUrl).host; } catch { return tabUrl; } })();

  return (
    <div style={{ padding: `${spacing.panelPaddingY}px ${spacing.panelPaddingX}px`, display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
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
          {(['all', 'xhr', 'doc', 'js', 'css', 'img', 'failed'] as NetworkFilter[]).map((f) => {
            const count = f === 'all' ? networkReqs.length
              : f === 'failed' ? networkReqs.filter((r) => r.failed || (r.status && r.status >= 400)).length
              : networkReqs.filter((r) => (typeMap[r.type] || 'other') === f).length;
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: active ? 'rgba(255,255,255,0.12)' : colors.subtle,
                  border: 'none',
                  borderRadius: 6,
                  color: active
                    ? (f === 'failed' ? colors.incident : colors.action)
                    : colors.textTertiary,
                  fontSize: fontSize.labelSecondary,
                  fontFamily: fonts.mono,
                  padding: '2px 6px',
                  cursor: 'pointer',
                }}
              >
                {f}{count > 0 ? ` ${count}` : ''}
              </button>
            );
          })}
        </div>
        {stats.avgResponseTime != null && (
          <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontFamily: fonts.mono }}>
            avg {stats.avgResponseTime}ms
          </span>
        )}
      </div>

      {/* Network entries */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: fontSize.body, color: colors.textTertiary, textAlign: 'center', paddingTop: 20 }}>
            {networkReqs.length === 0 ? 'no network activity yet' : `no ${filter} requests`}
          </div>
        ) : (
          filtered.slice(-25).reverse().map((req, i) => {
            const urlShort = (() => {
              try {
                const u = new URL(req.url);
                return u.pathname + (u.search ? '?' + u.search.slice(1, 30) : '');
              } catch {
                return req.url.slice(0, 50);
              }
            })();
            const statusColor = req.failed ? colors.incident
              : req.status && req.status >= 400 ? colors.incident
              : req.status && req.status >= 300 ? colors.anomaly
              : colors.healthy;

            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                  paddingBottom: 3,
                  marginBottom: 3,
                  borderBottom: `0.5px solid ${colors.divider}`,
                }}
              >
                <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontFamily: fonts.mono, flexShrink: 0, width: 28 }}>
                  {req.method}
                </span>
                <span style={{ fontSize: fontSize.labelSecondary, color: statusColor, fontFamily: fonts.mono, flexShrink: 0, width: 24 }}>
                  {req.failed ? 'ERR' : req.status || '...'}
                </span>
                <span style={{
                  fontSize: fontSize.labelSecondary,
                  color: colors.textPrimary,
                  fontFamily: fonts.mono,
                  flex: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {urlShort}
                </span>
                {req.duration != null && (
                  <span style={{ fontSize: fontSize.labelSecondary, color: req.duration > 1000 ? colors.anomaly : colors.textTertiary, fontFamily: fonts.mono, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {req.duration}ms
                  </span>
                )}
                <CopyCurlButton req={req} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function formatTimeAgoWithSuffix(dateStr: string): string {
  const short = formatTimeAgo(dateStr);
  return short === 'now' ? 'now' : `${short} ago`;
}

export function Anomaly() {
  const { hoverData, activeIntegration } = useVitalsStore();

  // Chrome network view
  if (activeIntegration === 'chrome') {
    const chromeData = hoverData.chrome?.data;
    return <ChromeNetworkView data={chromeData || {}} />;
  }

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

          {github.commits.length > 0 && (
            <div style={{ marginTop: spacing.sectionGap, paddingTop: spacing.sectionGap, borderTop: `0.5px solid ${colors.divider}` }}>
              <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, marginBottom: spacing.lineGap }}>recent commits</div>
              {github.commits.slice(0, 3).map((c, i, arr) => (
                <div key={c.fullSha} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: i < arr.length - 1 ? spacing.lineGap : 0, borderBottom: i < arr.length - 1 ? `0.5px solid ${colors.divider}` : 'none', marginBottom: i < arr.length - 1 ? spacing.lineGap : 0 }}>
                  <CommitIcon />
                  <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>{c.repo}</span>
                  <button onClick={() => { if (c.repoFullName && c.fullSha.length > 7) window.vitals.openExternal(`https://github.com/${c.repoFullName}/commit/${c.fullSha}`); }}
                    style={{ background: colors.subtle, border: 'none', borderRadius: 6, padding: '1px 4px', fontSize: fontSize.labelSecondary, color: colors.textSecondary, fontFamily: fonts.mono, cursor: 'pointer' }}>{c.sha}</button>
                  <span style={{ fontSize: fontSize.body, color: colors.textPrimary, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.message}</span>
                  <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{formatTimeAgoWithSuffix(c.date)}</span>
                </div>
              ))}
            </div>
          )}
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
