import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock electron (app.getPath used by secure-store)
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/vitals-test' },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() },
}));

// Mock electron-store dynamic import
vi.mock('electron-store', () => ({ default: class {} }));

import { isInSilenceWindow } from '../store';
import type { SmartSilenceConfig } from '../store';

describe('isInSilenceWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when disabled', () => {
    const config: SmartSilenceConfig = { enabled: false, startHour: 19, endHour: 8, weekends: true };
    expect(isInSilenceWindow(config)).toBe(false);
  });

  it('returns true during silence hours (cross-midnight)', () => {
    // Set time to 21:00 on a Wednesday
    vi.setSystemTime(new Date('2025-01-08T21:00:00'));
    const config: SmartSilenceConfig = { enabled: true, startHour: 19, endHour: 8, weekends: false };
    expect(isInSilenceWindow(config)).toBe(true);
  });

  it('returns false outside silence hours', () => {
    // Set time to 12:00 on a Wednesday
    vi.setSystemTime(new Date('2025-01-08T12:00:00'));
    const config: SmartSilenceConfig = { enabled: true, startHour: 19, endHour: 8, weekends: false };
    expect(isInSilenceWindow(config)).toBe(false);
  });

  it('returns true on weekends when weekends enabled', () => {
    // Saturday at noon
    vi.setSystemTime(new Date('2025-01-11T12:00:00'));
    const config: SmartSilenceConfig = { enabled: true, startHour: 19, endHour: 8, weekends: true };
    expect(isInSilenceWindow(config)).toBe(true);
  });

  it('returns false on weekends when weekends disabled', () => {
    // Saturday at noon
    vi.setSystemTime(new Date('2025-01-11T12:00:00'));
    const config: SmartSilenceConfig = { enabled: true, startHour: 19, endHour: 8, weekends: false };
    expect(isInSilenceWindow(config)).toBe(false);
  });

  it('handles same-day range (startHour < endHour)', () => {
    // 10:00 on a Wednesday, silence from 8 to 19
    vi.setSystemTime(new Date('2025-01-08T10:00:00'));
    const config: SmartSilenceConfig = { enabled: true, startHour: 8, endHour: 19, weekends: false };
    expect(isInSilenceWindow(config)).toBe(true);
  });
});
