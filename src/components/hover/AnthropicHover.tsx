import { colors, fontSize, fonts, spacing } from '../../lib/design-tokens';
import { useVitalsStore } from '../../store/useVitalsStore';
import { HoverPanel, StatCell, MiniBar, BottomBar, formatNum } from './shared';

export function AnthropicHover({ data }: { data: any }) {
  const tab = useVitalsStore((s) => s.activeTab) || 'activity';
  const totals = data?.totals ?? {};
  const sessions = totals.sessions ?? 0;
  const linesAdded = totals.linesAdded ?? 0;
  const linesRemoved = totals.linesRemoved ?? 0;
  const commits = totals.commits ?? 0;
  const pullRequests = totals.pullRequests ?? 0;
  const totalCostCents = totals.totalCostCents ?? 0;
  const editAcceptRate = totals.editAcceptRate ?? 0;
  const models: Array<{ model: string; estimatedCostCents: number }> = totals.models ?? [];
  const totalCost = totalCostCents / 100;
  const maxModelCost = Math.max(...models.map((m) => m.estimatedCostCents), 1);

  return (
    <HoverPanel>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'activity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sectionGap }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <StatCell label="sessions" value={String(sessions)} />
              <div>
                <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>lines +/-</span>
                <div style={{ fontSize: fontSize.bodyLarge, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ color: colors.healthy }}>+{formatNum(linesAdded)}</span>
                  {'  '}
                  <span style={{ color: colors.incident }}>-{formatNum(linesRemoved)}</span>
                </div>
              </div>
              <StatCell label="commits" value={String(commits)} />
              <StatCell label="PRs" value={String(pullRequests)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>accept rate</span>
              <MiniBar value={editAcceptRate} max={100} color={editAcceptRate >= 70 ? colors.healthy : editAcceptRate >= 50 ? colors.anomaly : colors.incident} />
              <span style={{ fontSize: fontSize.bodyLarge, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{Math.round(editAcceptRate)}%</span>
            </div>
          </div>
        )}
        {tab === 'models' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lineGap }}>
            {models.map((m) => {
              const mCost = m.estimatedCostCents / 100;
              return (
                <div key={m.model} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: fontSize.labelSecondary, color: colors.textSecondary, fontFamily: fonts.mono, width: 110, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.model}</span>
                  <MiniBar value={m.estimatedCostCents} max={maxModelCost} color={colors.info} />
                  <span style={{ fontSize: fontSize.labelSecondary, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums', flexShrink: 0, width: 50, textAlign: 'right' }}>${mCost.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <BottomBar>
        <StatCell label="cost (7d)" value={`$${totalCost.toFixed(2)}`} />
        <StatCell label="input tok" value={formatNum(totals.totalInputTokens ?? 0)} />
        <StatCell label="output tok" value={formatNum(totals.totalOutputTokens ?? 0)} />
      </BottomBar>
    </HoverPanel>
  );
}
