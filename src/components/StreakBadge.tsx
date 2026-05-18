/**
 * StreakBadge — compact flame + number for the resting state wings.
 *
 * Animation states:
 * - Active today: steady glow, healthy color
 * - At risk: gentle pulse (opacity oscillation)
 * - Milestone (7, 30, 100, 365): brief celebratory scale pop on mount
 * - Increment: number slides up on change
 */

import { useState, useEffect, useRef } from 'react';
import { colors, fonts } from '../lib/design-tokens';

interface StreakBadgeProps {
  streak: number;
  isActiveToday: boolean;
}

const MILESTONE_DAYS = [7, 30, 50, 100, 200, 365];

function isMilestone(n: number): boolean {
  return MILESTONE_DAYS.includes(n);
}

/** Inline mini flame — 10x10, lighter weight than hover version */
function MiniFlame({ color, pulse }: { color: string; pulse: boolean }) {
  return (
    <svg width={10} height={10} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M8 2C8 2 5 5.5 5 8.5C5 10.5 6.2 12.5 8 13.5C9.8 12.5 11 10.5 11 8.5C11 5.5 8 2 8 2Z"
        fill={color}
        style={{
          animation: pulse ? 'vitals-streak-mini-pulse 2s ease-in-out infinite' : undefined,
        }}
      />
    </svg>
  );
}

export function StreakBadge({ streak, isActiveToday }: StreakBadgeProps) {
  const [justIncremented, setJustIncremented] = useState(false);
  const prevStreak = useRef(streak);
  const milestone = isMilestone(streak);

  useEffect(() => {
    if (streak > prevStreak.current) {
      setJustIncremented(true);
      const t = setTimeout(() => setJustIncremented(false), 1200);
      prevStreak.current = streak;
      return () => clearTimeout(t);
    }
    prevStreak.current = streak;
  }, [streak]);

  if (streak < 2) return null;

  const flameColor = isActiveToday
    ? milestone ? '#fbbf24' : colors.healthy
    : colors.textTertiary;

  const numberColor = isActiveToday
    ? milestone ? '#fbbf24' : colors.textPrimary
    : colors.textTertiary;

  const display = streak >= 365 ? '365+' : String(streak);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        animation: justIncremented ? 'vitals-streak-pop 0.6s ease both' : undefined,
      }}
    >
      <MiniFlame color={flameColor} pulse={!isActiveToday} />
      <span
        style={{
          fontSize: 11,
          fontFamily: fonts.mono,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.02em',
          color: numberColor,
          fontWeight: 500,
          textShadow: milestone && isActiveToday ? '0 0 4px rgba(251,191,36,0.4)' : 'none',
        }}
      >
        {display}
      </span>
      <style>{`
        @keyframes vitals-streak-mini-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes vitals-streak-pop {
          0% { transform: scale(1); }
          30% { transform: scale(1.25); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
