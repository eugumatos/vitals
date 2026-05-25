import { colors, fontSize, spacing, radius } from '../../lib/design-tokens';
import { HoverPanel, StatCell, MiniBar, BottomBar } from './shared';

const statusColor = (status: string) => {
  if (status === 'ACTIVE_HEALTHY') return colors.healthy;
  if (status === 'ACTIVE_UNHEALTHY') return colors.incident;
  return colors.textTertiary;
};

const statusLabel = (status: string) => {
  if (status === 'ACTIVE_HEALTHY') return 'healthy';
  if (status === 'ACTIVE_UNHEALTHY') return 'unhealthy';
  if (status === 'INACTIVE') return 'paused';
  return status.toLowerCase().replace('active_', '');
};

const diskColor = (pct: number | null) => {
  if (pct == null) return colors.textTertiary;
  if (pct > 90) return colors.incident;
  if (pct > 75) return colors.anomaly;
  return colors.healthy;
};

const connColor = (n: number | null) => {
  if (n == null) return colors.textTertiary;
  if (n > 50) return colors.incident;
  if (n > 30) return colors.anomaly;
  return colors.textSecondary;
};

function ProjectCard({ p }: { p: any }) {
  const isUnhealthy = p.status === 'ACTIVE_UNHEALTHY';
  const totalLints = (p.advisors?.performance ?? 0) + (p.advisors?.security ?? 0);

  return (
    <div
      onClick={() => (window as any).vitals?.openExternal(`https://supabase.com/dashboard/project/${p.id}`)}
      style={{
        padding: '8px 10px',
        borderRadius: radius.md,
        border: `1px solid ${isUnhealthy ? 'rgba(239,68,68,0.25)' : colors.divider}`,
        background: colors.subtle,
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      {/* Row 1: name + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: statusColor(p.status), flexShrink: 0 }} />
        <span style={{ fontSize: fontSize.body, color: colors.textPrimary, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
          {p.name}
        </span>
        <span style={{ fontSize: 10, color: statusColor(p.status), fontWeight: 500 }}>
          {statusLabel(p.status)}
        </span>
      </div>

      {/* Row 2: disk bar + connections */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
        {p.diskPercent != null ? (
          <>
            <span style={{ fontSize: 10, color: colors.textTertiary, width: 24, flexShrink: 0 }}>disk</span>
            <MiniBar value={p.diskPercent} max={100} color={diskColor(p.diskPercent)} />
            <span style={{ fontSize: 10, color: diskColor(p.diskPercent), fontVariantNumeric: 'tabular-nums', flexShrink: 0, width: 28, textAlign: 'right' }}>
              {p.diskPercent}%
            </span>
          </>
        ) : (
          <span style={{ fontSize: 10, color: colors.textTertiary }}>disk n/a</span>
        )}
        {p.activeConnections != null && (
          <span style={{ fontSize: 10, color: connColor(p.activeConnections), fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 'auto' }}>
            {p.activeConnections} conn
          </span>
        )}
      </div>

      {/* Row 3: functions + lints (only if present) */}
      {(p.edgeFunctions > 0 || totalLints > 0) && (
        <div style={{ display: 'flex', gap: 10, fontSize: 10, whiteSpace: 'nowrap' }}>
          {p.edgeFunctions > 0 && (
            <span style={{ color: colors.textSecondary }}>{p.edgeFunctions} fn</span>
          )}
          {p.advisors?.performance > 0 && (
            <span style={{ color: colors.anomaly }}>{p.advisors.performance} perf</span>
          )}
          {p.advisors?.security > 0 && (
            <span style={{ color: colors.incident }}>{p.advisors.security} sec</span>
          )}
        </div>
      )}
    </div>
  );
}

export function SupabaseHover({ data }: { data: any }) {
  const projects: Array<any> = data?.projects ?? [];
  const stats = data?.stats ?? {};

  const sorted = [...projects].sort((a, b) => {
    if (a.status === 'ACTIVE_UNHEALTHY' && b.status !== 'ACTIVE_UNHEALTHY') return -1;
    if (a.status !== 'ACTIVE_UNHEALTHY' && b.status === 'ACTIVE_UNHEALTHY') return 1;
    return 0;
  });

  return (
    <HoverPanel>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      </div>
      <BottomBar>
        <StatCell label="projects" value={String(stats.totalProjects ?? 0)} />
        <StatCell label="healthy" value={String(stats.healthy ?? 0)} color={colors.healthy} />
        {(stats.unhealthy ?? 0) > 0 && <StatCell label="unhealthy" value={String(stats.unhealthy)} color={colors.incident} />}
        {(stats.totalFunctions ?? 0) > 0 && <StatCell label="fn" value={String(stats.totalFunctions)} />}
        {(stats.totalAdvisors ?? 0) > 0 && <StatCell label="lints" value={String(stats.totalAdvisors)} color={colors.anomaly} />}
      </BottomBar>
    </HoverPanel>
  );
}
