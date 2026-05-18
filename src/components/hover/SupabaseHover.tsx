import { colors, fontSize, spacing, radius } from '../../lib/design-tokens';
import { HoverPanel } from './shared';

export function SupabaseHover({ data }: { data: any }) {
  const projects: Array<{
    id: string;
    name: string;
    region: string;
    status: string;
    databaseSize: string;
    activeConnections: number;
  }> = data?.projects ?? [];
  const stats = data?.stats ?? { totalProjects: 0, healthy: 0, unhealthy: 0, inactive: 0 };

  const sorted = [...projects].sort((a, b) => {
    if (a.status === 'UNHEALTHY' && b.status !== 'UNHEALTHY') return -1;
    if (a.status !== 'UNHEALTHY' && b.status === 'UNHEALTHY') return 1;
    return 0;
  });

  const connColor = (n: number) => (n > 50 ? colors.incident : n > 30 ? colors.anomaly : colors.textTertiary);

  return (
    <HoverPanel>
      {/* Stats line */}
      <div style={{ display: 'flex', gap: 14, fontSize: fontSize.body, marginBottom: spacing.sectionGap }}>
        <span style={{ color: colors.textPrimary }}>{stats.totalProjects} projects</span>
        {stats.healthy > 0 && <span style={{ color: colors.healthy }}>{stats.healthy} healthy</span>}
        {stats.unhealthy > 0 && <span style={{ color: colors.incident }}>{stats.unhealthy} unhealthy</span>}
        {stats.inactive > 0 && <span style={{ color: colors.textTertiary }}>{stats.inactive} inactive</span>}
      </div>

      {/* Project cards */}
      <div style={{ display: 'flex', gap: 8, overflow: 'hidden', flex: 1 }}>
        {sorted.map((p) => {
          const isUnhealthy = p.status?.toUpperCase() === 'UNHEALTHY';
          const statusColor = isUnhealthy ? colors.incident : colors.healthy;
          return (
            <div
              key={p.id}
              onClick={() =>
                (window as any).vitals?.openExternal(`https://supabase.com/dashboard/project/${p.id}`)
              }
              style={{
                width: 175,
                flexShrink: 0,
                padding: '8px 10px',
                borderRadius: radius.md,
                border: `1px solid ${isUnhealthy ? 'rgba(239,68,68,0.35)' : colors.divider}`,
                background: colors.subtle,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {/* Name */}
              <span
                style={{
                  fontSize: fontSize.body,
                  color: colors.textPrimary,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {p.name}
              </span>

              {/* Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: statusColor,
                  }}
                />
                <span style={{ fontSize: fontSize.labelSecondary, color: statusColor, textTransform: 'uppercase' }}>
                  {p.status}
                </span>
              </div>

              {/* Region */}
              <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>{p.region}</span>

              {/* DB size + connections */}
              <div style={{ display: 'flex', gap: 8, fontSize: fontSize.labelSecondary }}>
                <span style={{ color: colors.textSecondary }}>{p.databaseSize}</span>
                <span style={{ color: connColor(p.activeConnections) }}>
                  {p.activeConnections}conn
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </HoverPanel>
  );
}
