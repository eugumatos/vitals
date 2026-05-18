import { useState } from 'react';
import { colors, fontSize, fonts, spacing } from '../../lib/design-tokens';
import { useVitalsStore } from '../../store/useVitalsStore';
import { HoverPanel, Badge, FilterPills, BottomBar, StatCell } from './shared';

type LogFilter = 'all' | 'error' | 'warning' | 'log';

const levelBadge: Record<string, { label: string; color: string; bg: string }> = {
  error: { label: 'ERR', color: '#fca5a5', bg: 'rgba(239,68,68,0.18)' },
  warn: { label: 'WARN', color: '#fcd34d', bg: 'rgba(245,185,66,0.14)' },
  warning: { label: 'WARN', color: '#fcd34d', bg: 'rgba(245,185,66,0.14)' },
  log: { label: 'LOG', color: colors.textTertiary, bg: colors.subtle },
  info: { label: 'INFO', color: colors.info, bg: 'rgba(96,165,250,0.12)' },
};

function statusColor(code: number): string {
  if (code >= 500) return colors.incident;
  if (code >= 400) return colors.anomaly;
  return colors.healthy;
}

function extractPath(url: string): string {
  try { return new URL(url).pathname; } catch { return url; }
}

export function ChromeHover({ data }: { data: any }) {
  const tab = useVitalsStore((s) => s.activeTab) || 'console';
  const [logFilter, setLogFilter] = useState<LogFilter>('all');

  const consoleEntries: Array<{ timestamp: string; level: string; text: string }> = data?.console ?? [];
  const networkEntries: Array<{ method: string; url: string; status: number; duration: number }> = data?.network ?? [];
  const stats = data?.stats ?? { errors: 0, warnings: 0, logs: 0 };

  const filteredConsole = logFilter === 'all' ? consoleEntries : consoleEntries.filter((e) => e.level === logFilter);

  const filterOptions: Array<{ label: string; value: LogFilter; count?: number }> = [
    { label: 'all', value: 'all', count: consoleEntries.length },
    { label: 'err', value: 'error', count: consoleEntries.filter((e) => e.level === 'error').length },
    { label: 'warn', value: 'warning', count: consoleEntries.filter((e) => e.level === 'warning' || e.level === 'warn').length },
    { label: 'log', value: 'log', count: consoleEntries.filter((e) => e.level === 'log').length },
  ];

  return (
    <HoverPanel>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'console' && (
          <>
            <div style={{ marginBottom: 4 }}>
              <FilterPills options={filterOptions} active={logFilter} onChange={setLogFilter} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, overflow: 'hidden' }}>
              {filteredConsole.slice(0, 7).map((entry, i) => {
                const badge = levelBadge[entry.level] ?? levelBadge.log;
                const isError = entry.level === 'error';
                return (
                  <div key={i}
                    onClick={() => isError && navigator.clipboard.writeText(entry.text)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '2px 4px', borderRadius: 3,
                      background: isError ? 'rgba(239,68,68,0.06)' : 'transparent',
                      cursor: isError ? 'pointer' : 'default',
                    }}
                  >
                    <Badge color={badge.color} bg={badge.bg}>{badge.label}</Badge>
                    <span style={{ flex: 1, fontSize: 12, fontFamily: fonts.mono, color: colors.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.text}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {tab === 'network' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, overflow: 'hidden' }}>
            {networkEntries.slice(0, 7).map((entry, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px', borderRadius: 3,
                background: entry.status >= 500 ? 'rgba(239,68,68,0.06)' : 'transparent',
              }}>
                <span style={{ fontSize: 12, fontFamily: fonts.mono, color: colors.textTertiary, flexShrink: 0, width: 32 }}>{entry.method}</span>
                <span style={{ flex: 1, fontSize: 12, fontFamily: fonts.mono, color: colors.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{extractPath(entry.url)}</span>
                <span style={{ fontSize: 12, fontFamily: fonts.mono, color: statusColor(entry.status), flexShrink: 0 }}>{entry.status}</span>
                <span style={{ fontSize: 11, color: colors.textTertiary, flexShrink: 0, fontVariantNumeric: 'tabular-nums', width: 38, textAlign: 'right' }}>{entry.duration}ms</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <BottomBar>
        <StatCell label="errors" value={String(stats.errors)} color={stats.errors > 0 ? colors.incident : undefined} />
        <StatCell label="warnings" value={String(stats.warnings)} color={stats.warnings > 0 ? colors.anomaly : undefined} />
        <StatCell label="logs" value={String(stats.logs)} />
      </BottomBar>
    </HoverPanel>
  );
}
