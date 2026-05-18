import { useState, useMemo } from 'react';
import { colors, fontSize, spacing } from '../../lib/design-tokens';
import { useVitalsStore } from '../../store/useVitalsStore';
import type { SentryData } from '../../store/types';
import {
  HoverPanel, StatusDot, Tag, Badge, DataRow, RowLabel, RowMeta,
  StatCell, BottomBar, FilterPills, formatNum, formatTimeAgo,
} from './shared';

function levelDotColor(level: string): string {
  if (level === 'fatal' || level === 'error') return colors.incident;
  if (level === 'warning') return colors.anomaly;
  return colors.textTertiary;
}

function barColor(ratio: number): string {
  if (ratio > 0.7) return colors.incident;
  if (ratio > 0.35) return colors.anomaly;
  return 'rgba(255,255,255,0.20)';
}

function simulateDailyBars(total24h: number): number[] {
  return [0.6, 0.8, 0.45, 1.0, 0.7, 0.9, 0.55].map((f) => Math.round(total24h * f));
}

export function SentryHover({ data }: { data: SentryData }) {
  const { issues, stats } = data;
  const tab = useVitalsStore((s) => s.activeTab) || 'issues';
  const [projectFilter, setProjectFilter] = useState('all');

  const projects = useMemo(() => [...new Set(issues.map((i) => i.project))], [issues]);
  const filtered = useMemo(
    () => projectFilter === 'all' ? issues : issues.filter((i) => i.project === projectFilter),
    [issues, projectFilter],
  );
  const dailyBars = useMemo(() => simulateDailyBars(stats.totalErrors24h), [stats.totalErrors24h]);
  const maxBar = Math.max(...dailyBars, 1);

  const projectOptions = useMemo(
    () => [{ label: 'all', value: 'all' as string }, ...projects.map((p) => ({ label: p, value: p }))],
    [projects],
  );

  return (
    <HoverPanel>
      {tab === 'issues' && projects.length > 1 && (
        <div style={{ marginBottom: 6 }}>
          <FilterPills options={projectOptions} active={projectFilter} onChange={setProjectFilter} />
        </div>
      )}

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'issues' && (
          filtered.length > 0 ? filtered.slice(0, 6).map((issue, i) => (
            <DataRow key={issue.id} last={i === Math.min(filtered.length, 6) - 1}
              onClick={() => window.vitals.openExternal(issue.permalink)}
            >
              <StatusDot color={levelDotColor(issue.level)} />
              <RowLabel>{issue.title}</RowLabel>
              <Tag>{issue.project}</Tag>
              <RowMeta>{`${formatNum(issue.count)}x`}</RowMeta>
              {issue.isNew && <Badge color={colors.info} bg="rgba(96,165,250,0.15)">new</Badge>}
              {issue.isUnhandled && <Badge color={colors.anomaly} bg="rgba(245,185,66,0.15)">unh</Badge>}
              <RowMeta>{formatTimeAgo(issue.lastSeen)}</RowMeta>
            </DataRow>
          )) : <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, padding: 8 }}>No issues</span>
        )}

        {tab === 'stats' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, marginBottom: 6 }}>errors / day (7d)</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 48 }}>
                {dailyBars.map((v, i) => (
                  <div key={i} style={{
                    flex: 1, height: `${Math.max(8, (v / maxBar) * 100)}%`,
                    borderRadius: 2, background: barColor(v / maxBar), minHeight: 3,
                  }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                <span style={{ fontSize: 9, color: colors.textTertiary }}>7d ago</span>
                <span style={{ fontSize: 9, color: colors.textTertiary }}>today</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <StatCell label="Errors/24h" value={formatNum(stats.totalErrors24h)} color={stats.totalErrors24h > 100 ? colors.incident : undefined} />
              <StatCell label="Unresolved" value={formatNum(stats.unresolvedCount)} color={stats.unresolvedCount > 0 ? colors.anomaly : undefined} />
              <StatCell label="New today" value={String(stats.newIssues24h)} color={stats.newIssues24h > 0 ? colors.info : undefined} />
            </div>
          </div>
        )}
      </div>

      {tab === 'issues' && (
        <BottomBar>
          <StatCell label="Errors/24h" value={formatNum(stats.totalErrors24h)} color={stats.totalErrors24h > 100 ? colors.incident : undefined} />
          <StatCell label="Unresolved" value={formatNum(stats.unresolvedCount)} />
          {stats.newIssues24h > 0 && <StatCell label="New" value={String(stats.newIssues24h)} color={colors.info} />}
        </BottomBar>
      )}
    </HoverPanel>
  );
}
