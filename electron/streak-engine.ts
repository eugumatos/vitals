/**
 * Streak calculation engine.
 *
 * A "Vitals day" starts at CUTOFF_HOUR (4am local).
 * A deploy at 2am counts for the previous calendar day.
 * Streak = consecutive Vitals days with at least 1 successful deploy.
 */

import { getAllSuccessfulDeploys } from './history-store';

const CUTOFF_HOUR = 4;

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  todayCount: number;
  isActiveToday: boolean;
  lastDeployAt: string | null;
}

/** Determine the "Vitals day" (YYYY-MM-DD) for a given ISO timestamp. */
function toVitalsDay(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  // Subtract cutoff hours — a deploy before 4am belongs to the previous day
  date.setHours(date.getHours() - CUTOFF_HOUR);
  return date.toISOString().split('T')[0];
}

/** Get today's Vitals day string. */
function getTodayVitalsDay(): string {
  const now = new Date();
  now.setHours(now.getHours() - CUTOFF_HOUR);
  return now.toISOString().split('T')[0];
}

/** Walk a sorted array of date strings backward counting consecutive days. */
function countConsecutive(sortedDaysDesc: string[], startDay: string): number {
  let count = 0;
  let current = new Date(startDay + 'T00:00:00');

  for (let i = 0; i < sortedDaysDesc.length; i++) {
    const expected = current.toISOString().split('T')[0];
    if (sortedDaysDesc.includes(expected)) {
      count++;
      current.setDate(current.getDate() - 1);
    } else {
      break;
    }
  }

  return count;
}

/** Find the longest streak in a set of day strings. */
function findLongestStreak(daysSet: Set<string>): number {
  if (daysSet.size === 0) return 0;

  const sorted = [...daysSet].sort(); // ASC
  let longest = 1;
  let current = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00');
    const curr = new Date(sorted[i] + 'T00:00:00');
    const diffDays = (curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000);

    if (diffDays === 1) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}

// --- Cache ---

let cached: StreakData | null = null;
let dayRolloverTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleDayRollover(onChange?: () => void): void {
  if (dayRolloverTimeout) clearTimeout(dayRolloverTimeout);

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(CUTOFF_HOUR, 0, 0, 0);
  const msUntilRollover = tomorrow.getTime() - now.getTime();

  dayRolloverTimeout = setTimeout(() => {
    invalidateStreakCache();
    onChange?.();
    scheduleDayRollover(onChange);
  }, msUntilRollover);
}

export function initStreakEngine(onChange?: () => void): void {
  scheduleDayRollover(onChange);
}

export function invalidateStreakCache(): void {
  cached = null;
}

export async function getStreakData(): Promise<StreakData> {
  if (cached) return cached;
  cached = await calculateStreaks();
  return cached;
}

export async function calculateStreaks(): Promise<StreakData> {
  const deploys = await getAllSuccessfulDeploys();

  if (deploys.length === 0) {
    return { currentStreak: 0, longestStreak: 0, todayCount: 0, isActiveToday: false, lastDeployAt: null };
  }

  const today = getTodayVitalsDay();

  // Bucket deploys into Vitals days
  const daysSet = new Set<string>();
  let todayCount = 0;

  for (const deploy of deploys) {
    const day = toVitalsDay(deploy.startedAt);
    daysSet.add(day);
    if (day === today) todayCount++;
  }

  const isActiveToday = daysSet.has(today);

  // Current streak: walk backward from today (or yesterday if today not active)
  const startDay = isActiveToday ? today : (() => {
    const yesterday = new Date(today + 'T00:00:00');
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  })();

  // Only count if the startDay has a deploy
  let currentStreak = 0;
  if (daysSet.has(startDay)) {
    let cursor = new Date(startDay + 'T00:00:00');
    while (daysSet.has(cursor.toISOString().split('T')[0])) {
      currentStreak++;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  const longestStreak = findLongestStreak(daysSet);
  const lastDeployAt = deploys[0]?.startedAt ?? null;

  return { currentStreak, longestStreak, todayCount, isActiveToday, lastDeployAt };
}
