import { useState } from 'react';
import { useVitalsStore } from '../../store/useVitalsStore';
import { colors, fontSize, spacing, fonts } from '../../lib/design-tokens';
import { motion } from 'framer-motion';
import { ShieldCheckIcon, FlameIcon, XCircleIcon } from '../ui/Icons';
import { SkeletonList, Skeleton } from '../ui/Skeleton';
import type { VercelLogLine, VercelProjectLogs } from '../../store/types';

type LogFilter = 'all' | 'error' | 'warning';
type LogSource = 'runtime' | 'build';

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function Incident() {
  const { hoverData, activeIntegration } = useVitalsStore();
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');

  const { github, vercel } = hoverData;

  // GitHub incidents
  const failedActions = github.actions.filter((a) => a.conclusion === 'failure');
  const repoFailCounts: Record<string, number> = {};
  for (const a of failedActions) {
    repoFailCounts[a.repo] = (repoFailCounts[a.repo] || 0) + 1;
  }
  const criticalRepos = Object.entries(repoFailCounts).filter(([, count]) => count >= 2);
  const hasGitHubIncident = failedActions.length >= 3 || criticalRepos.length > 0;

  // Vercel incidents — 2+ error deploys or same project failing repeatedly
  const errorDeploys = (vercel?.deployments || []).filter((d) => d.state === 'ERROR');
  const projectFailCounts: Record<string, number> = {};
  for (const d of errorDeploys) {
    projectFailCounts[d.project] = (projectFailCounts[d.project] || 0) + 1;
  }
  const criticalProjects = Object.entries(projectFailCounts).filter(([, count]) => count >= 2);
  const hasVercelIncident = errorDeploys.length >= 2 || criticalProjects.length > 0;

  // Collect logs from logsPerProject
  const logsPerProject = vercel?.logsPerProject || {} as Record<string, VercelProjectLogs>;
  const logProjectNames = Object.keys(logsPerProject);

  // Determine if we have runtime or build logs
  const activeProjectLogs = selectedProject !== 'all'
    ? { [selectedProject]: logsPerProject[selectedProject] }
    : logsPerProject;

  let logSource: LogSource = 'runtime';
  const allLogs: Array<VercelLogLine & { project: string }> = [];
  for (const [project, projectLogs] of Object.entries(activeProjectLogs)) {
    if (!projectLogs) continue;
    const logs = projectLogs.runtime.length > 0 ? projectLogs.runtime : projectLogs.build;
    if (projectLogs.runtime.length === 0 && projectLogs.build.length > 0) logSource = 'build';
    for (const log of logs) {
      allLogs.push({ ...log, project });
    }
  }

  const filteredLogs = logFilter === 'all'
    ? allLogs
    : allLogs.filter((l) => l.type === logFilter);
  const hasVercelLogs = logProjectNames.length > 0;

  const lastPolledAt = useVitalsStore((s) => s.lastPolledAt);
  const connectors = useVitalsStore((s) => s.connectors);
  const isConnected = activeIntegration === 'vercel'
    ? connectors.find((c) => c.id === 'vercel')?.connected
    : connectors.find((c) => c.id === 'github')?.connected;

  const hasContent = activeIntegration === 'vercel' ? (hasVercelLogs || hasVercelIncident)
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
          {activeIntegration === 'vercel' ? 'no runtime logs' : 'no active incidents'}
        </span>
      </div>
    );
  }

  const githubNarrative = criticalRepos.length > 0
    ? `${criticalRepos.map(([repo, count]) => `${repo}: ${count} failures`).join(', ')}. CI pipeline may be broken.`
    : `${failedActions.length} CI failures detected across repos.`;

  const vercelNarrative = criticalProjects.length > 0
    ? `${criticalProjects.map(([proj, count]) => `${proj}: ${count} failures`).join(', ')}. Deploy pipeline may be broken.`
    : `${errorDeploys.length} deploy failures detected.`;

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
      {/* header — GitHub: flame incident / Vercel: runtime logs */}
      {activeIntegration === 'github' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: spacing.sectionGap }}>
            <motion.div
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <FlameIcon size={18} />
            </motion.div>
            <span style={{ fontSize: fontSize.title, color: colors.incident }}>
              CI incident — {failedActions.length} failures
            </span>
          </div>
          <p style={{ fontSize: fontSize.bodyLarge, color: colors.textSecondary, lineHeight: 1.4, marginBottom: spacing.sectionGap }}>
            {githubNarrative}
          </p>
        </>
      )}

      {/* GitHub failed runs */}
      {activeIntegration === 'github' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lineGap }}>
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
                      style={{ background: colors.subtle, border: 'none', borderRadius: 3, padding: '1px 4px', fontSize: fontSize.labelSecondary, color: colors.textSecondary, fontFamily: fonts.mono, cursor: 'pointer' }}>{action.sha}</button>
                    <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontFamily: fonts.mono }}>{action.branch}</span>
                  </div>
                </div>
                <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{formatTimeAgo(action.updatedAt)}</span>
              </div>
            ))}
          </div>
          {criticalRepos.length > 0 && (
            <div style={{ marginTop: 'auto', paddingTop: spacing.sectionGap, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { const repo = failedActions[0]; if (repo?.repoFullName) window.vitals.openExternal(`https://github.com/${repo.repoFullName}/actions`); }}
                style={{ background: colors.incident, border: 'none', borderRadius: 6, color: '#000', fontSize: fontSize.labelSecondary, fontWeight: 600, padding: '5px 14px', cursor: 'pointer' }}>
                open actions
              </button>
            </div>
          )}
        </>
      )}

      {/* Vercel logs */}
      {activeIntegration === 'vercel' && (
        <>
          {/* Project selector */}
          <div style={{ display: 'flex', gap: 3, marginBottom: spacing.lineGap, flexWrap: 'wrap' }}>
            <button
              onClick={() => setSelectedProject('all')}
              style={{
                background: selectedProject === 'all' ? 'rgba(255,255,255,0.12)' : colors.subtle,
                border: 'none', borderRadius: 3,
                color: selectedProject === 'all' ? colors.action : colors.textTertiary,
                fontSize: fontSize.labelSecondary, fontFamily: fonts.mono,
                padding: '2px 6px', cursor: 'pointer',
              }}
            >
              all
            </button>
            {logProjectNames.map((name) => (
              <button
                key={name}
                onClick={() => setSelectedProject(name)}
                style={{
                  background: selectedProject === name ? 'rgba(255,255,255,0.12)' : colors.subtle,
                  border: 'none', borderRadius: 3,
                  color: selectedProject === name ? colors.action : colors.textTertiary,
                  fontSize: fontSize.labelSecondary, fontFamily: fonts.mono,
                  padding: '2px 6px', cursor: 'pointer',
                }}
              >
                {name}
              </button>
            ))}
          </div>

          {/* Source indicator + level filter */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lineGap + 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>
                {filteredLogs.length} {logFilter === 'all' ? 'entries' : logFilter === 'error' ? 'errors' : 'warnings'}
              </span>
              <span style={{ fontSize: 10, color: logSource === 'runtime' ? colors.healthy : colors.textTertiary, background: colors.subtle, padding: '1px 4px', borderRadius: 3 }}>
                {logSource}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {(['all', 'error', 'warning'] as LogFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setLogFilter(f)}
                  style={{
                    background: logFilter === f ? 'rgba(255,255,255,0.12)' : colors.subtle,
                    border: 'none',
                    borderRadius: 3,
                    color: logFilter === f
                      ? (f === 'error' ? colors.incident : f === 'warning' ? colors.anomaly : colors.action)
                      : colors.textTertiary,
                    fontSize: fontSize.labelSecondary,
                    padding: '1px 6px',
                    cursor: 'pointer',
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Log lines */}
          <div
            style={{
              background: colors.subtle,
              borderRadius: 6,
              border: `0.5px solid ${colors.divider}`,
              padding: '8px 10px',
              flex: 1,
              overflowY: 'auto',
            }}
          >
            {filteredLogs.length === 0 && (
              <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, textAlign: 'center', padding: 12 }}>
                no {logFilter} logs
              </div>
            )}
            {logSource === 'build' && (
              <div style={{ fontSize: 10, color: colors.textTertiary, textAlign: 'center', padding: '4px 0 6px', borderBottom: `0.5px solid ${colors.divider}` }}>
                no runtime logs available — showing build output.{' '}
                <button
                  onClick={() => {
                    const proj = selectedProject !== 'all' ? selectedProject : logProjectNames[0];
                    if (proj) window.vitals.openExternal(`https://vercel.com/${proj}/logs`);
                  }}
                  style={{ background: 'none', border: 'none', color: colors.action, fontSize: 10, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                >
                  open runtime logs
                </button>
              </div>
            )}
            {filteredLogs.map((log, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 6,
                  padding: '2px 0',
                  borderBottom: i < filteredLogs.length - 1 ? `0.5px solid ${colors.divider}` : 'none',
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: fonts.mono,
                    color: log.type === 'error' ? colors.incident : log.type === 'warning' ? colors.anomaly : colors.textTertiary,
                    width: 14,
                    flexShrink: 0,
                    textAlign: 'center',
                    lineHeight: '18px',
                    fontWeight: 600,
                  }}
                >
                  {log.type === 'error' ? 'E' : log.type === 'warning' ? 'W' : '·'}
                </span>
                <span style={{ fontSize: 10, fontFamily: fonts.mono, color: colors.textTertiary, flexShrink: 0, lineHeight: '18px', fontVariantNumeric: 'tabular-nums' }}>
                  {log.project}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: fonts.mono,
                    color: log.type === 'error' ? colors.incident : log.type === 'warning' ? colors.anomaly : colors.textSecondary,
                    lineHeight: '18px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    flex: 1,
                  }}
                >
                  {log.text}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
