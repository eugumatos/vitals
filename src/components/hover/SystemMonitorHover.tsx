import { useVitalsStore } from '../../store/useVitalsStore';
import { colors, fontSize, fonts, spacing } from '../../lib/design-tokens';
import { HoverPanel, StatCell, BottomBar } from './shared';

interface SystemMonitorData {
  cpu: {
    usage: number;
    cores: number;
    model: string;
    speed: number;
    perCore: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  uptime: number;
  loadAvg: [number, number, number];
  hostname: string;
  platform: string;
  arch: string;
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function usageColor(percent: number): string {
  if (percent >= 90) return colors.incident;
  if (percent >= 70) return colors.anomaly;
  return colors.healthy;
}

function UsageBar({ percent, label, detail }: { percent: number; label: string; detail: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
      <span style={{
        fontSize: fontSize.labelSecondary,
        color: colors.textSecondary,
        fontFamily: fonts.mono,
        width: 32,
        flexShrink: 0,
        textAlign: 'right',
      }}>
        {label}
      </span>
      <div style={{
        flex: 1,
        height: 6,
        borderRadius: 3,
        background: colors.subtle,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.min(100, percent)}%`,
          height: '100%',
          borderRadius: 3,
          background: usageColor(percent),
          transition: 'width 0.3s ease, background-color 0.3s ease',
        }} />
      </div>
      <span style={{
        fontSize: fontSize.labelSecondary,
        color: usageColor(percent),
        fontFamily: fonts.mono,
        fontVariantNumeric: 'tabular-nums',
        width: 36,
        flexShrink: 0,
        textAlign: 'right',
      }}>
        {detail}
      </span>
    </div>
  );
}

function CoreGrid({ perCore }: { perCore: number[] }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))',
      gap: 4,
      padding: '4px 0',
    }}>
      {perCore.map((usage, i) => (
        <div key={i} style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          padding: '4px 2px',
          borderRadius: 6,
          background: colors.subtle,
        }}>
          <span style={{
            fontSize: 10,
            color: colors.textTertiary,
            fontFamily: fonts.mono,
          }}>
            {i}
          </span>
          <div style={{
            width: '100%',
            height: 4,
            borderRadius: 2,
            background: 'rgba(255,255,255,0.04)',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.min(100, usage)}%`,
              height: '100%',
              borderRadius: 2,
              background: usageColor(usage),
              transition: 'width 0.3s ease',
            }} />
          </div>
          <span style={{
            fontSize: 10,
            color: usageColor(usage),
            fontFamily: fonts.mono,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {usage}%
          </span>
        </div>
      ))}
    </div>
  );
}

export function SystemMonitorHover({ data }: { data: SystemMonitorData }) {
  const activeTab = useVitalsStore((s) => s.activeTab) || 'overview';

  if (activeTab === 'cores') {
    return (
      <HoverPanel>
        <div style={{ marginBottom: 6 }}>
          <span style={{
            fontSize: fontSize.labelSecondary,
            color: colors.textTertiary,
          }}>
            {data.cpu.model} — {data.cpu.cores} cores
          </span>
        </div>
        <div style={{
          flex: 1,
          overflowY: 'auto',
        }}>
          <CoreGrid perCore={data.cpu.perCore} />
        </div>
        <BottomBar>
          <StatCell label="avg" value={`${data.cpu.usage}%`} color={usageColor(data.cpu.usage)} />
          <StatCell label="load" value={data.loadAvg.map((l) => l.toFixed(1)).join(' ')} />
          <StatCell label="uptime" value={formatUptime(data.uptime)} />
        </BottomBar>
      </HoverPanel>
    );
  }

  // Overview tab
  return (
    <HoverPanel>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* CPU */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}>
            <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>cpu</span>
            <span style={{
              fontSize: fontSize.body,
              fontFamily: fonts.mono,
              fontVariantNumeric: 'tabular-nums',
              color: usageColor(data.cpu.usage),
              fontWeight: 600,
            }}>
              {data.cpu.usage}%
            </span>
          </div>
          <UsageBar percent={data.cpu.usage} label="use" detail={`${data.cpu.usage}%`} />
        </div>

        {/* Memory */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}>
            <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>memory</span>
            <span style={{
              fontSize: fontSize.body,
              fontFamily: fonts.mono,
              fontVariantNumeric: 'tabular-nums',
              color: usageColor(data.memory.usagePercent),
              fontWeight: 600,
            }}>
              {formatBytes(data.memory.used)} / {formatBytes(data.memory.total)}
            </span>
          </div>
          <UsageBar percent={data.memory.usagePercent} label="ram" detail={`${data.memory.usagePercent}%`} />
        </div>

        {/* Load Average */}
        <div style={{
          display: 'flex',
          gap: 12,
          padding: '4px 0',
        }}>
          <div>
            <span style={{ fontSize: 10, color: colors.textTertiary, fontFamily: fonts.mono }}>load 1m </span>
            <span style={{ fontSize: fontSize.labelSecondary, color: colors.textPrimary, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>
              {data.loadAvg[0].toFixed(2)}
            </span>
          </div>
          <div>
            <span style={{ fontSize: 10, color: colors.textTertiary, fontFamily: fonts.mono }}>5m </span>
            <span style={{ fontSize: fontSize.labelSecondary, color: colors.textPrimary, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>
              {data.loadAvg[1].toFixed(2)}
            </span>
          </div>
          <div>
            <span style={{ fontSize: 10, color: colors.textTertiary, fontFamily: fonts.mono }}>15m </span>
            <span style={{ fontSize: fontSize.labelSecondary, color: colors.textPrimary, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>
              {data.loadAvg[2].toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <BottomBar>
        <StatCell label="cores" value={`${data.cpu.cores}`} />
        <StatCell label="uptime" value={formatUptime(data.uptime)} />
        <StatCell label="host" value={data.hostname} />
      </BottomBar>
    </HoverPanel>
  );
}
