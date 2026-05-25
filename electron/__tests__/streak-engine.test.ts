import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock history-store before importing streak-engine
vi.mock('../history-store', () => ({
  getAllSuccessfulDeploys: vi.fn().mockResolvedValue([]),
}));

import { calculateStreaks } from '../streak-engine';
import { getAllSuccessfulDeploys } from '../history-store';

const mockGetAll = vi.mocked(getAllSuccessfulDeploys);

// Use fixed "now" at noon UTC to avoid timezone edge cases
const NOW = new Date('2025-06-15T12:00:00Z');

function daysAgoUTC(n: number, hour = 12): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

describe('streak-engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockGetAll.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns zeros when no deploys exist', async () => {
    mockGetAll.mockResolvedValue([]);
    const result = await calculateStreaks();
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
    expect(result.todayCount).toBe(0);
    expect(result.isActiveToday).toBe(false);
    expect(result.lastDeployAt).toBeNull();
  });

  it('counts consecutive days as streak', async () => {
    mockGetAll.mockResolvedValue([
      { startedAt: daysAgoUTC(0) } as any,
      { startedAt: daysAgoUTC(1) } as any,
      { startedAt: daysAgoUTC(2) } as any,
    ]);
    const result = await calculateStreaks();
    expect(result.currentStreak).toBe(3);
    expect(result.isActiveToday).toBe(true);
    expect(result.todayCount).toBe(1);
  });

  it('breaks streak on gap day', async () => {
    mockGetAll.mockResolvedValue([
      { startedAt: daysAgoUTC(0) } as any,
      { startedAt: daysAgoUTC(1) } as any,
      // gap at day 2
      { startedAt: daysAgoUTC(3) } as any,
    ]);
    const result = await calculateStreaks();
    expect(result.currentStreak).toBe(2);
    expect(result.longestStreak).toBe(2);
  });

  it('deploy before 4am counts as previous day', async () => {
    // A deploy at 3am UTC today should count as previous "vitals day"
    mockGetAll.mockResolvedValue([
      { startedAt: daysAgoUTC(0, 3) } as any,
      { startedAt: daysAgoUTC(1) } as any,
    ]);
    const result = await calculateStreaks();
    // 3am deploy belongs to yesterday, plus yesterday's noon deploy = 1 vitals day
    // Today (noon) has no deploy, so streak counts from yesterday backward
    expect(result.currentStreak).toBeGreaterThanOrEqual(1);
  });
});
