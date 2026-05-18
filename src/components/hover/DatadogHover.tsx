import { colors, fontSize, spacing } from '../../lib/design-tokens';
import { useVitalsStore } from '../../store/useVitalsStore';
import { HoverPanel, StatusDot, BottomBar, StatCell, formatTimeAgo } from './shared';

const stateColor: Record<string, string> = {
  Alert: colors.incident, Warn: colors.anomaly, OK: colors.healthy, 'No Data': colors.textTertiary,
};
const stateSortOrder: Record<string, number> = { Alert: 0, Warn: 1, OK: 2, 'No Data': 3 };

export function DatadogHover({ data }: { data: any }) {
  const tab = useVitalsStore((s) => s.activeTab) || 'monitors';
  const monitors: Array<{ id: string; name: string; type: string; overallState: string }> = data?.monitors ?? [];
  const events: Array<{ title: string; alertType: string; dateHappened: string }> = data?.events ?? [];
  const stats = data?.stats ?? { totalMonitors: 0, alerting: 0, warning: 0, ok: 0, noData: 0 };

  const sorted = [...monitors].sort((a, b) => (stateSortOrder[a.overallState] ?? 4) - (stateSortOrder[b.overallState] ?? 4));

  return (
    <HoverPanel>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'monitors' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sorted.slice(0, 12).map((m) => {
              const color = stateColor[m.overallState] ?? colors.textTertiary;
              return (
                <div key={m.id}
                  onClick={() => window.vitals.openExternal(`https://app.datadoghq.com/monitors/${m.id}`)}
                  style={{ width: 82, padding: '5px 6px', borderRadius: 6, background: colors.subtle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <StatusDot color={color} pulse={m.overallState === 'Alert'} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: colors.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                    <div style={{ fontSize: 9, color, fontWeight: 600 }}>{m.overallState}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {tab === 'events' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {events.length > 0 ? events.slice(0, 6).map((ev, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: i < Math.min(events.length, 6) - 1 ? `0.5px solid ${colors.divider}` : 'none' }}>
                <StatusDot color={ev.alertType === 'error' ? colors.incident : ev.alertType === 'warning' ? colors.anomaly : colors.info} />
                <span style={{ flex: 1, fontSize: fontSize.labelSecondary, color: colors.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</span>
                <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{formatTimeAgo(ev.dateHappened)}</span>
              </div>
            )) : <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, padding: 8 }}>No recent events</span>}
          </div>
        )}
      </div>
      <BottomBar>
        <StatCell label="OK" value={String(stats.ok)} color={colors.healthy} />
        {stats.alerting > 0 && <StatCell label="Alert" value={String(stats.alerting)} color={colors.incident} />}
        {stats.warning > 0 && <StatCell label="Warn" value={String(stats.warning)} color={colors.anomaly} />}
        <StatCell label="Total" value={String(stats.totalMonitors)} />
      </BottomBar>
    </HoverPanel>
  );
}
