import { colors, fontSize, fonts, spacing } from '../../lib/design-tokens';

// ── Shared primitives for hover views ──

export function StatusDot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <div style={{
      width: 6, height: 6, borderRadius: '50%', backgroundColor: color, flexShrink: 0,
      animation: pulse ? 'vitals-pulse 1.5s ease-in-out infinite' : undefined,
    }} />
  );
}

export function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>{label}</span>
      <div style={{ fontSize: fontSize.bodyLarge, color: color || colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, marginBottom: spacing.lineGap }}>
      {children}
    </div>
  );
}

export function Tag({ children, color }: { children: string; color?: string }) {
  return (
    <span style={{
      fontSize: fontSize.labelSecondary, color: color || colors.textTertiary,
      fontFamily: fonts.mono, background: colors.subtle,
      padding: '1px 4px', borderRadius: 4, flexShrink: 0,
      maxWidth: 100, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {children}
    </span>
  );
}

export function Badge({ children, color, bg }: { children: string; color: string; bg: string }) {
  return (
    <span style={{
      fontSize: 10, color, background: bg,
      padding: '1px 5px', borderRadius: 4, flexShrink: 0,
    }}>
      {children}
    </span>
  );
}

export function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 'auto', paddingTop: spacing.sectionGap - 2,
      borderTop: `0.5px solid ${colors.divider}`,
      display: 'flex', gap: 14,
    }}>
      {children}
    </div>
  );
}

export function DataRow({ children, onClick, last }: { children: React.ReactNode; onClick?: () => void; last?: boolean }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        paddingBottom: last ? 0 : spacing.lineGap,
        borderBottom: last ? 'none' : `0.5px solid ${colors.divider}`,
        marginBottom: last ? 0 : spacing.lineGap,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </div>
  );
}

export function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: fontSize.body, color: colors.textPrimary,
      flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {children}
    </span>
  );
}

export function RowMeta({ children, color }: { children: string; color?: string }) {
  return (
    <span style={{
      fontSize: fontSize.labelSecondary, color: color || colors.textTertiary,
      fontVariantNumeric: 'tabular-nums', flexShrink: 0,
    }}>
      {children}
    </span>
  );
}


export function FilterPills<T extends string>({ options, active, onChange }: {
  options: Array<{ label: string; value: T; count?: number }>;
  active: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            background: active === opt.value ? 'rgba(255,255,255,0.12)' : colors.subtle,
            border: 'none', borderRadius: 6,
            color: active === opt.value ? colors.action : colors.textTertiary,
            fontSize: fontSize.labelSecondary, fontFamily: fonts.mono,
            padding: '2px 6px', cursor: 'pointer',
          }}
        >
          {opt.label}{opt.count != null ? ` ${opt.count}` : ''}
        </button>
      ))}
    </div>
  );
}

export function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
      <div style={{ height: '100%', borderRadius: 2, width: `${pct}%`, background: color }} />
    </div>
  );
}

export function HoverPanel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: `${spacing.panelPaddingY}px ${spacing.panelPaddingX}px`,
      display: 'flex', flexDirection: 'column',
      width: '100%', height: '100%', gap: 0,
    }}>
      {children}
    </div>
  );
}

export function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export { formatTimeAgo } from '../../lib/utils';
