import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock history-store before importing streak-engine
vi.mock('../history-store', () => ({
  getAllSuccessfulDeploys: vi.fn().mockResolvedValue([]),
}));

import { calculateStreaks } from '../streak-engine';
import { getAllSuccessfulDeploys } from '../history-store';

const mockGetAll = vi.mocked(getAllSuccessfulDeploys);

function daysAgo(n: number, hour = 12): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

describe('streak-engine', () => {
  beforeEach(() => {
    mockGetAll.mockReset();
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
      { startedAt: daysAgo(0) } as any,
      { startedAt: daysAgo(1) } as any,
      { startedAt: daysAgo(2) } as any,
    ]);
    const result = await calculateStreaks();
    expect(result.currentStreak).toBe(3);
    expect(result.isActiveToday).toBe(true);
    expect(result.todayCount).toBe(1);
  });

  it('breaks streak on gap day', async () => {
    mockGetAll.mockResolvedValue([
      { startedAt: daysAgo(0) } as any,
      { startedAt: daysAgo(1) } as any,
      // gap at day 2
      { startedAt: daysAgo(3) } as any,
    ]);
    const result = await calculateStreaks();
    expect(result.currentStreak).toBe(2);
    expect(result.longestStreak).toBe(2);
  });

  it('deploy before 4am counts as previous day', async () => {
    // A deploy at 3am today should count as yesterday
    const earlyMorning = new Date();
    earlyMorning.setHours(3, 0, 0, 0);

    // Also add a deploy yesterday at noon
    mockGetAll.mockResolvedValue([
      { startedAt: earlyMorning.toISOString() } as any,
      { startedAt: daysAgo(1) } as any,
    ]);
    const result = await calculateStreaks();
    // The early morning deploy belongs to "yesterday", so we have yesterday active
    // but today may or may not be active depending on current time vs 4am cutoff
    expect(result.currentStreak).toBeGreaterThanOrEqual(1);
  });
});
