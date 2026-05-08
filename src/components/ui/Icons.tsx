import { colors } from '../../lib/design-tokens';

// Status icons — replace colored dots with meaningful icons

export function CheckCircleIcon({ size = 14, color = colors.healthy }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.2" />
      <path d="M5 8.2l2 2 4-4.4" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AlertTriangleIcon({ size = 14, color = colors.anomaly }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M8 1.5L14.5 13.5H1.5L8 1.5z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <line x1="8" y1="6" x2="8" y2="9.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r="0.7" fill={color} />
    </svg>
  );
}

export function XCircleIcon({ size = 14, color = colors.incident }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.2" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function ShieldCheckIcon({ size = 14, color = colors.healthy }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M8 1L2.5 3.5v4c0 3.5 2.3 5.8 5.5 7 3.2-1.2 5.5-3.5 5.5-7v-4L8 1z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M5.5 8l1.8 1.8L10.5 6" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FlameIcon({ size = 14, color = colors.incident }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M8 1c0 2.5-3 4-3 7a3.5 3.5 0 007 0c0-2-1.5-3-1.5-5S8 1 8 1z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 10.5c-.8 0-1.5-.6-1.5-1.5 0-.8.7-1.2.7-2 .3.4.8.8.8 2 0 .9-.7 1.5-1.5 1.5z" fill={color} opacity="0.5" />
    </svg>
  );
}

export function CIFailIcon({ size = 13, color = colors.anomaly }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke={color} strokeWidth="1.2" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function CommitIcon({ size = 13, color = colors.textTertiary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <circle cx="8" cy="8" r="3" stroke={color} strokeWidth="1.2" />
      <line x1="8" y1="0.5" x2="8" y2="5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="8" y1="11" x2="8" y2="15.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
