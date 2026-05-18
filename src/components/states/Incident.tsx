import { useState, useEffect, useRef, useCallback } from 'react';
import { useVitalsStore } from '../../store/useVitalsStore';
import { colors, fontSize, spacing, fonts } from '../../lib/design-tokens';
import { ShieldCheckIcon, FlameIcon, XCircleIcon } from '../ui/Icons';
import { SkeletonList, Skeleton } from '../ui/Skeleton';
import { formatTimeAgo } from '../../lib/utils';
import type { VercelLogLine, VercelProjectLogs } from '../../store/types';

type LogFilter = 'all' | 'error' | 'warning';
type LogKind = 'all' | 'request' | 'console';

function formatTimeAgoWithSuffix(dateStr: string): string {
  const short = formatTimeAgo(dateStr);
  return short === 'now' ? 'now' : `${short} ago`;
}

function formatLogTime(timestamp: string): string {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

function statusColor(code: number): string {
  if (code >= 500) return colors.incident;
  if (code >= 400) return colors.anomaly;
  if (code >= 300) return 'rgba(96,165,250,0.8)';
  return colors.healthy;
}

function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET': return colors.healthy;
    case 'POST': return colors.info;
    case 'PUT': case 'PATCH': return colors.anomaly;
    case 'DELETE': return colors.incident;
    default: return colors.textSecondary;
  }
}

function durationColor(ms: number): string {
  if (ms > 5000) return colors.incident;
  if (ms > 1000) return colors.anomaly;
  return colors.textTertiary;
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

// Pill button for filters
function FilterPill({ active, label, color, onClick }: { active: boolean; label: string; color?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
        border: active ? '0.5px solid rgba(255,255,255,0.12)' : '0.5px solid transparent',
        borderRadius: 10,
        color: active ? (color || colors.action) : colors.textTertiary,
        fontSize: 11,
        fontFamily: fonts.mono,
        padding: '2px 7px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        lineHeight: '16px',
      }}
    >
      {label}
    </button>
  );
}

// Single request log row
function RequestLogRow({ log }: { log: VercelLogLine & { project: string } }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 0',
        fontFamily: fonts.mono,
        fontSize: 11,
        lineHeight: '16px',
      }}
    >
      {/* Timestamp */}
      <span style={{ color: colors.textTertiary, fontSize: 10, flexShrink: 0, fontVariantNumeric: 'tabular-nums', width: 52 }}>
        {formatLogTime(log.timestamp)}
      </span>

      {/* Method badge */}
      <span
        style={{
          color: methodColor(log.method!),
          fontWeight: 600,
          fontSize: 10,
          width: 32,
          flexShrink: 0,
          textAlign: 'right',
        }}
      >
        {log.method}
      </span>

      {/* Status code */}
      <span
        style={{
          color: statusColor(log.statusCode!),
          fontWeight: 600,
          fontSize: 10,
          width: 22,
          flexShrink: 0,
          textAlign: 'center',
        }}
      >
        {log.statusCode}
      </span>

      {/* Path */}
      <span
        style={{
          color: log.statusCode! >= 400 ? statusColor(log.statusCode!) : colors.textSecondary,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {log.path}
      </span>

      {/* Duration */}
      {log.duration != null && (
        <span
          style={{
            color: durationColor(log.duration),
            fontSize: 10,
            flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
            textAlign: 'right',
            width: 42,
          }}
        >
          {formatDuration(log.duration)}
        </span>
      )}
    </div>
  );
}

// Single console log row
function ConsoleLogRow({ log }: { log: VercelLogLine & { project: string } }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: '2px 0',
        fontFamily: fonts.mono,
        fontSize: 11,
        lineHeight: '16px',
      }}
    >
      {/* Timestamp */}
      <span style={{ color: colors.textTertiary, fontSize: 10, flexShrink: 0, fontVariantNumeric: 'tabular-nums', width: 52 }}>
        {formatLogTime(log.timestamp)}
      </span>

      {/* Level indicator */}
      <span
        style={{
          fontSize: 10,
          color: log.type === 'error' ? colors.incident : log.type === 'warning' ? colors.anomaly : colors.textTertiary,
          width: 12,
          flexShrink: 0,
          textAlign: 'center',
          fontWeight: 600,
        }}
      >
        {log.type === 'error' ? 'E' : log.type === 'warning' ? 'W' : '·'}
      </span>

      {/* Project name (only when showing all) */}
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
        {log.project}
      </span>

      {/* Log text */}
      <span
        style={{
          color: log.type === 'error' ? colors.incident : log.type === 'warning' ? colors.anomaly : colors.textSecondary,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          flex: 1,
        }}
      >
        {log.text}
      </span>
    </div>
  );
}

export function Incident() {
  const { hoverData, activeIntegration } = useVitalsStore();
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [logKind, setLogKind] = useState<LogKind>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [pathSearch, setPathSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [boostActive, setBoostActive] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const prevLogCountRef = useRef(0);

  const { github, vercel } = hoverData;

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (!autoScroll || !logContainerRef.current) return;
    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  });

  // Toggle boost polling
  const toggleBoost = useCallback(() => {
    const next = !boostActive;
    setBoostActive(next);
    window.vitals.vercel?.setBoost?.(next);
  }, [boostActive]);

  // Disable boost on unmount
  useEffect(() => {
    return () => {
      if (boostActive) {
        window.vitals.vercel?.setBoost?.(false);
      }
    };
  }, [boostActive]);

  // GitHub incidents
  const failedActions = github.actions.filter((a) => a.conclusion === 'failure');
  const repoFailCounts: Record<string, number> = {};
  for (const a of failedActions) {
    repoFailCounts[a.repo] = (repoFailCounts[a.repo] || 0) + 1;
  }
  const criticalRepos = Object.entries(repoFailCounts).filter(([, count]) => count >= 2);
  const hasGitHubIncident = failedActions.length >= 3 || criticalRepos.length > 0;

  // Collect runtime logs only (no build log fallback)
  const logsPerProject = vercel?.logsPerProject || {} as Record<string, VercelProjectLogs>;
  const logProjectNames = Object.keys(logsPerProject);

  const activeProjectLogs = selectedProject !== 'all'
    ? { [selectedProject]: logsPerProject[selectedProject] }
    : logsPerProject;

  const allLogs: Array<VercelLogLine & { project: string }> = [];
  for (const [project, projectLogs] of Object.entries(activeProjectLogs)) {
    if (!projectLogs) continue;
    for (const log of projectLogs.runtime) {
      allLogs.push({ ...log, project });
    }
  }

  // Apply filters
  let filteredLogs = allLogs;

  // Level filter
  if (logFilter !== 'all') {
    filteredLogs = filteredLogs.filter((l) => l.type === logFilter);
  }

  // Kind filter (request vs console)
  if (logKind === 'request') {
    filteredLogs = filteredLogs.filter((l) => l.method && l.path);
  } else if (logKind === 'console') {
    filteredLogs = filteredLogs.filter((l) => !l.method);
  }

  // Path search
  if (pathSearch.trim()) {
    const q = pathSearch.toLowerCase();
    filteredLogs = filteredLogs.filter((l) =>
      (l.path && l.path.toLowerCase().includes(q)) ||
      l.text.toLowerCase().includes(q)
    );
  }

  const requestCount = allLogs.filter((l) => l.method && l.path).length;
  const consoleCount = allLogs.filter((l) => !l.method).length;
  const errorCount = allLogs.filter((l) => l.type === 'error').length;
  const warnCount = allLogs.filter((l) => l.type === 'warning').length;

  // Track if new logs appeared (for scroll indicator)
  const newLogsAppeared = allLogs.length > prevLogCountRef.current;
  useEffect(() => {
    prevLogCountRef.current = allLogs.length;
  }, [allLogs.length]);

  const lastPolledAt = useVitalsStore((s) => s.lastPolledAt);
  const connectors = useVitalsStore((s) => s.connectors);
  const isConnected = connectors.find((c) => c.id === activeIntegration)?.connected;

  // Vercel always shows the logs panel (user can enable boost and wait for logs)
  // GitHub only shows when there are incidents
  const hasContent = activeIntegration === 'vercel'
    ? isConnected
    : activeIntegration === 'github' ? hasGitHubIncident
    : false;

  // Loading skeleton
  if (isConnected && !lastPolledAt) {
    return (
      <div style={{ padding: `${spacing.panelPaddingY + 2}px ${spacing.panelPaddingX}px`, width: '100%', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: spacing.sectionGap }}>
          <Skeleton width={18} height={18} borderRadius={9} />
          <Skeleton width={200} height={14} />
        </div>
        <Skeleton width="90%" height={12} style={{ marginBottom: 8 }} />
        <Skeleton width="60%" height={12} style={{ marginBottom: spacing.sectionGap }} />
        <SkeletonList rows={3} />
      </div>
    );
  }

  if (!hasContent) {
    return (
      <div style={{ padding: `${spacing.panelPaddingY}px ${spacing.panelPaddingX}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
        <ShieldCheckIcon size={20} />
        <span style={{ fontSize: fontSize.body, color: colors.textTertiary }}>
          no active incidents
        </span>
      </div>
    );
  }

  const githubNarrative = criticalRepos.length > 0
    ? `${criticalRepos.map(([repo, count]) => `${repo}: ${count} failures`).join(', ')}. CI pipeline may be broken.`
    : `${failedActions.length} CI failures detected across repos.`;

  return (
    <div
      style={{
        padding: `${spacing.panelPaddingY}px ${spacing.panelPaddingX}px`,
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* GitHub incident view (unchanged) */}
      {activeIntegration === 'github' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: spacing.sectionGap }}>
            <div style={{ animation: 'vitals-pulse 2s ease-in-out infinite' }}>
              <style>{`@keyframes vitals-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
              <FlameIcon size={18} />
            </div>
            <span style={{ fontSize: fontSize.title, color: colors.incident }}>
              CI incident — {failedActions.length} failures
            </span>
          </div>
          <p style={{ fontSize: fontSize.bodyLarge, color: colors.textSecondary, lineHeight: 1.4, marginBottom: spacing.sectionGap }}>
            {githubNarrative}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lineGap, overflowY: 'auto', flex: 1 }}>
            {failedActions.map((action, i, arr) => (
              <div key={`${action.sha}-${action.name}-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, paddingBottom: spacing.lineGap + 2, borderBottom: i < arr.length - 1 ? `0.5px solid ${colors.divider}` : 'none' }}>
                <div style={{ marginTop: 1 }}><XCircleIcon size={13} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>{action.repo}</span>
                    <span style={{ fontSize: fontSize.body, color: colors.incident }}>{action.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <button onClick={() => { if (action.repoFullName && action.fullSha.length > 7) window.vitals.openExternal(`https://github.com/${action.repoFullName}/actions`); }}
                      style={{ background: colors.subtle, border: 'none', borderRadius: 10, padding: '1px 4px', fontSize: fontSize.labelSecondary, color: colors.textSecondary, fontFamily: fonts.mono, cursor: 'pointer' }}>{action.sha}</button>
                    <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontFamily: fonts.mono }}>{action.branch}</span>
                  </div>
                </div>
                <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{formatTimeAgoWithSuffix(action.updatedAt)}</span>
              </div>
            ))}
          </div>
          {criticalRepos.length > 0 && (
            <div style={{ marginTop: 'auto', paddingTop: spacing.sectionGap, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { const repo = failedActions[0]; if (repo?.repoFullName) window.vitals.openExternal(`https://github.com/${repo.repoFullName}/actions`); }}
                style={{ background: colors.incident, border: 'none', borderRadius: 10, color: '#000', fontSize: fontSize.labelSecondary, fontWeight: 600, padding: '5px 14px', cursor: 'pointer' }}>
                open actions
              </button>
            </div>
          )}
        </>
      )}

      {/* Vercel logs — premium experience */}
      {activeIntegration === 'vercel' && (
        <>
          {/* Top bar: project tabs + boost button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 6 }}>
            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
              <FilterPill active={selectedProject === 'all'} label="all" onClick={() => setSelectedProject('all')} />
              {logProjectNames.map((name) => (
                <FilterPill key={name} active={selectedProject === name} label={name} onClick={() => setSelectedProject(name)} />
              ))}
            </div>

            {/* Live indicator + boost toggle */}
            <button
              onClick={toggleBoost}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: boostActive ? 'rgba(52,211,153,0.12)' : 'transparent',
                border: boostActive ? '0.5px solid rgba(52,211,153,0.2)' : '0.5px solid transparent',
                borderRadius: 10,
                padding: '2px 8px',
                cursor: 'pointer',
                fontSize: 10,
                fontFamily: fonts.mono,
                color: boostActive ? colors.healthy : colors.textTertiary,
                transition: 'all 0.2s ease',
              }}
            >
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: boostActive ? colors.healthy : colors.textTertiary,
                animation: boostActive ? 'vitals-live-dot 1.5s ease-in-out infinite' : 'none',
              }} />
              <style>{`@keyframes vitals-live-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
              {boostActive ? 'live' : 'boost'}
            </button>
          </div>

          {/* Filter bar: kind + level + search + auto-scroll */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
            {/* Kind filter */}
            <div style={{ display: 'flex', gap: 1 }}>
              <FilterPill active={logKind === 'all'} label={`all ${allLogs.length}`} onClick={() => setLogKind('all')} />
              {requestCount > 0 && (
                <FilterPill active={logKind === 'request'} label={`req ${requestCount}`} color={colors.info} onClick={() => setLogKind('request')} />
              )}
              {consoleCount > 0 && (
                <FilterPill active={logKind === 'console'} label={`log ${consoleCount}`} onClick={() => setLogKind('console')} />
              )}
            </div>

            <span style={{ width: '0.5px', height: 12, background: colors.divider, flexShrink: 0 }} />

            {/* Level filter */}
            <div style={{ display: 'flex', gap: 1 }}>
              <FilterPill active={logFilter === 'all'} label="all" onClick={() => setLogFilter('all')} />
              {errorCount > 0 && (
                <FilterPill active={logFilter === 'error'} label={`err ${errorCount}`} color={colors.incident} onClick={() => setLogFilter('error')} />
              )}
              {warnCount > 0 && (
                <FilterPill active={logFilter === 'warning'} label={`warn ${warnCount}`} color={colors.anomaly} onClick={() => setLogFilter('warning')} />
              )}
            </div>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Path search */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="filter..."
                value={pathSearch}
                onChange={(e) => setPathSearch(e.target.value)}
                style={{
                  background: pathSearch ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                  border: pathSearch ? '0.5px solid rgba(255,255,255,0.12)' : '0.5px solid transparent',
                  borderRadius: 8,
                  color: colors.textSecondary,
                  fontSize: 10,
                  fontFamily: fonts.mono,
                  padding: '2px 6px 2px 18px',
                  width: 90,
                  outline: 'none',
                  transition: 'all 0.15s ease',
                }}
              />
              {/* Search icon */}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ position: 'absolute', left: 5, pointerEvents: 'none' }}>
                <circle cx="4.2" cy="4.2" r="3" stroke={colors.textTertiary} strokeWidth="1" />
                <line x1="6.5" y1="6.5" x2="9" y2="9" stroke={colors.textTertiary} strokeWidth="1" strokeLinecap="round" />
              </svg>
            </div>

            {/* Auto-scroll toggle */}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
              style={{
                background: autoScroll ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: '0.5px solid transparent',
                borderRadius: 6,
                padding: '2px 4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 2v7M3.5 7L6 9.5 8.5 7" stroke={autoScroll ? colors.healthy : colors.textTertiary} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Log container */}
          <div
            ref={logContainerRef}
            onScroll={() => {
              if (!logContainerRef.current) return;
              const el = logContainerRef.current;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
              if (autoScroll !== atBottom) setAutoScroll(atBottom);
            }}
            style={{
              background: 'rgba(0,0,0,0.4)',
              borderRadius: 8,
              border: `0.5px solid ${colors.divider}`,
              padding: '6px 8px',
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
            }}
          >
            {filteredLogs.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '20px 12px', fontFamily: fonts.mono }}>
                {pathSearch ? (
                  <span style={{ fontSize: 11, color: colors.textTertiary }}>
                    no logs matching "{pathSearch}"
                  </span>
                ) : (
                  <>
                    <span style={{ fontSize: 11, color: colors.textTertiary }}>
                      waiting for runtime logs...
                    </span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center', lineHeight: 1.4 }}>
                      logs appear when serverless functions<br />
                      (API routes, edge functions) are invoked
                    </span>
                    {!boostActive && (
                      <button
                        onClick={toggleBoost}
                        style={{
                          marginTop: 4,
                          background: 'rgba(52,211,153,0.1)',
                          border: '0.5px solid rgba(52,211,153,0.2)',
                          borderRadius: 8,
                          color: colors.healthy,
                          fontSize: 10,
                          fontFamily: fonts.mono,
                          padding: '4px 10px',
                          cursor: 'pointer',
                        }}
                      >
                        enable live mode (5s refresh)
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
            {filteredLogs.map((log, i) => (
              <div
                key={`${log.timestamp}-${i}`}
                style={{
                  borderBottom: i < filteredLogs.length - 1 ? `0.5px solid rgba(255,255,255,0.03)` : 'none',
                }}
              >
                {log.method && log.path ? (
                  <RequestLogRow log={log} />
                ) : (
                  <ConsoleLogRow log={log} />
                )}
              </div>
            ))}
          </div>

          {/* Bottom stats bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, padding: '0 2px' }}>
            <span style={{ fontSize: 10, color: colors.textTertiary, fontFamily: fonts.mono }}>
              {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}
              {requestCount > 0 && ` · ${requestCount} req`}
            </span>
            <span style={{ fontSize: 10, color: colors.textTertiary, fontFamily: fonts.mono }}>
              {lastPolledAt ? `updated ${formatTimeAgo(lastPolledAt.toISOString())} ago` : ''}
              {boostActive && ' · 5s refresh'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
