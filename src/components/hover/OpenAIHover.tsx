import { colors, fontSize, fonts, spacing } from '../../lib/design-tokens';
import { useVitalsStore } from '../../store/useVitalsStore';
import { HoverPanel, StatCell, MiniBar, BottomBar, formatNum } from './shared';

export function OpenAIHover({ data }: { data: any }) {
  const tab = useVitalsStore((s) => s.activeTab) || 'overview';
  const { usage } = data ?? {};
  const totalCost = usage?.totalCost ?? 0;
  const totalRequests = usage?.totalRequests ?? 0;
  const totalInput = usage?.totalInputTokens ?? 0;
  const totalOutput = usage?.totalOutputTokens ?? 0;
  const totalTokens = totalInput + totalOutput;
  const models: Array<{ model: string; inputTokens: number; outputTokens: number; requests: number }> = usage?.byModel ?? [];
  const maxTokens = Math.max(...models.map((m) => m.inputTokens + m.outputTokens), 1);
  const costColor = totalCost > 50 ? colors.incident : totalCost > 10 ? colors.anomaly : colors.textPrimary;

  return (
    <HoverPanel>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sectionGap }}>
            <div onClick={() => window.vitals.openExternal('https://platform.openai.com/usage')} style={{ cursor: 'pointer' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: costColor, fontVariantNumeric: 'tabular-nums' }}>${totalCost.toFixed(2)}</div>
              <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>estimated cost</div>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <StatCell label="requests" value={formatNum(totalRequests)} />
              <StatCell label="input tokens" value={formatNum(totalInput)} />
              <StatCell label="output tokens" value={formatNum(totalOutput)} />
            </div>
          </div>
        )}
        {tab === 'models' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lineGap }}>
            {models.map((m) => {
              const mTokens = m.inputTokens + m.outputTokens;
              const mCost = totalTokens > 0 ? (mTokens / totalTokens) * totalCost : 0;
              return (
                <div key={m.model} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: fontSize.labelSecondary, color: colors.textSecondary, fontFamily: fonts.mono, width: 100, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.model}</span>
                  <MiniBar value={mTokens} max={maxTokens} color={colors.info} />
                  <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, flexShrink: 0, fontVariantNumeric: 'tabular-nums', width: 55, textAlign: 'right' }}>{formatNum(mTokens)} tok</span>
                  <span style={{ fontSize: fontSize.labelSecondary, color: colors.textSecondary, flexShrink: 0, fontVariantNumeric: 'tabular-nums', width: 45, textAlign: 'right' }}>${mCost.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <BottomBar>
        <StatCell label="cost" value={`$${totalCost.toFixed(2)}`} color={costColor} />
        <StatCell label="requests" value={formatNum(totalRequests)} />
        <StatCell label="tokens" value={formatNum(totalTokens)} />
      </BottomBar>
    </HoverPanel>
  );
}
