import { colors, fontSize, fonts, spacing } from '../../lib/design-tokens';
import { useVitalsStore } from '../../store/useVitalsStore';
import { HoverPanel, StatCell, MiniBar, BottomBar, formatNum } from './shared';

const PLAN_COLORS: Record<string, string> = {
  max: '#a78bfa',
  pro: '#60a5fa',
  api: '#34d399',
};

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function AnthropicHover({ data }: { data: any }) {
  const tab = useVitalsStore((s) => s.activeTab) || 'overview';
  const totals = data?.totals ?? {};
  const sessions = totals.sessions ?? 0;
  const totalCostCents = totals.totalCostCents ?? 0;
  const totalCost = totalCostCents / 100;
  const totalTokens = (totals.totalInputTokens ?? 0) + (totals.totalOutputTokens ?? 0);
  const models: Array<{ model: string; estimatedCostCents: number; inputTokens?: number; outputTokens?: number }> = totals.models ?? [];
  const recentSessions: Array<{ sessionId: string; project: string; startedAt: string; messages: number; tokens: number; costCents: number }> = totals.recentSessions ?? [];
  const plan = (totals.byPlan?.[0]?.customerType as string) || '';
  const planColor = PLAN_COLORS[plan] || colors.textTertiary;
  const isApi = plan === 'api';

  // For model bars: use tokens for Max/Pro, cost for API
  const maxModelVal = Math.max(...models.map((m) => isApi ? m.estimatedCostCents : (m.inputTokens ?? 0) + (m.outputTokens ?? 0)), 1);

  return (
    <HoverPanel>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sectionGap }}>
            {/* Headline: cost for API, tokens for Max/Pro */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <div>
                {isApi ? (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 700, color: totalCost > 50 ? colors.incident : colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                      ~${totalCost.toFixed(2)}
                    </div>
                    <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>estimated cost · 7d</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 700, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                      {formatNum(totalTokens)}
                    </div>
                    <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>tokens · 7d</div>
                  </>
                )}
              </div>
              {plan && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: planColor,
                  background: `${planColor}18`, padding: '2px 8px', borderRadius: 4,
                  fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {plan}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 16, whiteSpace: 'nowrap' }}>
              <StatCell label="sessions" value={String(sessions)} />
              <StatCell label="input" value={formatNum(totals.totalInputTokens ?? 0)} />
              <StatCell label="output" value={formatNum(totals.totalOutputTokens ?? 0)} />
              {isApi && <StatCell label="cost" value={`~$${totalCost.toFixed(2)}`} />}
            </div>
            {/* Top models */}
            {models.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {models.slice(0, 3).map((m) => {
                  const mTokens = (m.inputTokens ?? 0) + (m.outputTokens ?? 0);
                  const barVal = isApi ? m.estimatedCostCents : mTokens;
                  return (
                    <div key={m.model} style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: fontSize.labelSecondary, color: colors.textSecondary, fontFamily: fonts.mono, width: 110, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.model}</span>
                      <MiniBar value={barVal} max={maxModelVal} color={planColor || colors.info} />
                      <span style={{ fontSize: fontSize.labelSecondary, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums', flexShrink: 0, width: 55, textAlign: 'right' }}>
                        {isApi ? `$${(m.estimatedCostCents / 100).toFixed(2)}` : formatNum(mTokens)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {tab === 'sessions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lineGap }}>
            {recentSessions.length === 0 ? (
              <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>no sessions in last 7 days</div>
            ) : (
              recentSessions.map((sess) => (
                <div key={sess.sessionId} style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                  <span style={{
                    fontSize: fontSize.labelSecondary, color: colors.textPrimary, fontFamily: fonts.mono,
                    width: 90, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {sess.project || sess.sessionId.slice(0, 8)}
                  </span>
                  <span style={{ fontSize: fontSize.labelSecondary, color: colors.textSecondary, fontVariantNumeric: 'tabular-nums', flexShrink: 0, width: 70, textAlign: 'right' }}>
                    {isApi ? `$${(sess.costCents / 100).toFixed(2)}` : `${formatNum(sess.tokens)} tok`}
                  </span>
                  <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, flexShrink: 0, width: 52, textAlign: 'right' }}>
                    {formatNum(sess.messages)} msg
                  </span>
                  <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, marginLeft: 'auto', flexShrink: 0 }}>
                    {timeAgo(sess.startedAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <BottomBar>
        {isApi ? (
          <>
            <StatCell label="cost" value={`~$${totalCost.toFixed(2)}`} />
            <StatCell label="sessions" value={String(sessions)} />
            <StatCell label="tokens" value={formatNum(totalTokens)} />
          </>
        ) : (
          <>
            <StatCell label="tokens" value={formatNum(totalTokens)} />
            <StatCell label="sessions" value={String(sessions)} />
            <StatCell label="models" value={String(models.length)} />
          </>
        )}
      </BottomBar>
    </HoverPanel>
  );
}
