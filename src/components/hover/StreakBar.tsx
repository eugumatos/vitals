/**
 * StreakBar — persistent top bar in hover state showing streak info.
 *
 * Visual states:
 * - Active today (isActiveToday): flame glows with warm gradient, number in healthy green
 * - At risk (streak > 0 but no deploy today): flame dims, subtle pulse to nudge
 * - New record (currentStreak >= longestStreak && currentStreak > 1): golden shimmer on the flame
 * - No streak (currentStreak === 0): hidden entirely
 */

import { useVitalsStore } from '../../store/useVitalsStore';
import { colors, fontSize, fonts, spacing } from '../../lib/design-tokens';

// --- Flame SVG Icon ---
// Minimal, geometric flame that fits the app's monochrome aesthetic

function FlameIcon({ size = 14, color = colors.healthy, glow = false, shimmer = false }: {
  size?: number;
  color?: string;
  glow?: boolean;
  shimmer?: boolean;
}) {
  const id = `flame-grad-${shimmer ? 'shimmer' : 'static'}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={{
        flexShrink: 0,
        filter: glow ? `drop-shadow(0 0 3px ${color})` : 'none',
        animation: shimmer ? 'vitals-streak-shimmer 2.5s ease-in-out infinite' : undefined,
      }}
    >
      {shimmer && (
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f5b942" />
            <stop offset="50%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M8 1C8 1 4.5 5 4.5 8.5C4.5 11 6 13.5 8 14.5C10 13.5 11.5 11 11.5 8.5C11.5 5 8 1 8 1ZM8 12.5C6.8 11.8 6 10.3 6 9C6 7 7.5 4.5 8 3.5C8.5 4.5 10 7 10 9C10 10.3 9.2 11.8 8 12.5Z"
        fill={shimmer ? `url(#${id})` : color}
      />
    </svg>
  );
}

// --- Streak number with milestone animations ---

function StreakNumber({ value, isRecord }: { value: number; isRecord: boolean }) {
  const display = value >= 365 ? '365+' : String(value);
  return (
    <span
      style={{
        fontSize: fontSize.bodyLarge,
        fontFamily: fonts.mono,
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 600,
        letterSpacing: '-0.02em',
        color: isRecord ? '#fbbf24' : colors.textPrimary,
        animation: isRecord ? 'vitals-streak-number-glow 3s ease-in-out infinite' : undefined,
      }}
    >
      {display}
    </span>
  );
}

// --- Main component ---

export function StreakBar() {
  const streakData = useVitalsStore((s) => s.streakData);

  if (!streakData || streakData.currentStreak < 1) return null;

  const { currentStreak, longestStreak, todayCount, isActiveToday } = streakData;
  const isRecord = currentStreak >= longestStreak && currentStreak > 1;
  const atRisk = !isActiveToday && currentStreak > 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: `6px ${spacing.panelPaddingX}px`,
        borderBottom: `0.5px solid ${colors.divider}`,
        minHeight: 28,
      }}
    >
      {/* Flame + streak count */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          animation: atRisk ? 'vitals-streak-at-risk 3s ease-in-out infinite' : undefined,
        }}
      >
        <FlameIcon
          size={14}
          color={isRecord ? '#fbbf24' : isActiveToday ? colors.healthy : colors.textTertiary}
          glow={isActiveToday}
          shimmer={isRecord}
        />
        <StreakNumber value={currentStreak} isRecord={isRecord} />
      </div>

      {/* Label */}
      <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>
        {currentStreak === 1 ? 'day' : 'days'}
      </span>

      {/* Separator */}
      <div style={{ width: 1, height: 12, backgroundColor: colors.divider, flexShrink: 0 }} />

      {/* Today count */}
      <span style={{ fontSize: fontSize.labelSecondary, color: colors.textSecondary, fontFamily: fonts.mono }}>
        {todayCount} today
      </span>

      {/* Longest streak (only show if different from current) */}
      {longestStreak > currentStreak && (
        <>
          <div style={{ width: 1, height: 12, backgroundColor: colors.divider, flexShrink: 0 }} />
          <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontFamily: fonts.mono }}>
            best {longestStreak >= 365 ? '365+' : longestStreak}
          </span>
        </>
      )}

      {/* Record badge */}
      {isRecord && currentStreak > 2 && (
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            color: '#fbbf24',
            background: 'rgba(251, 191, 36, 0.1)',
            padding: '1px 6px',
            borderRadius: 4,
            fontWeight: 500,
            animation: 'vitals-streak-badge-in 0.5s ease both',
          }}
        >
          new record
        </span>
      )}

      {/* At risk indicator */}
      {atRisk && (
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            color: colors.textTertiary,
            fontStyle: 'italic',
          }}
        >
          keep it going
        </span>
      )}

      <style>{`
        @keyframes vitals-streak-shimmer {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 3px #fbbf24); }
          50% { transform: scale(1.1); filter: drop-shadow(0 0 6px #fde68a); }
        }
        @keyframes vitals-streak-number-glow {
          0%, 100% { text-shadow: 0 0 4px rgba(251, 191, 36, 0.3); }
          50% { text-shadow: 0 0 8px rgba(251, 191, 36, 0.6); }
        }
        @keyframes vitals-streak-at-risk {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes vitals-streak-badge-in {
          from { opacity: 0; transform: translateY(-4px) scale(0.9); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
