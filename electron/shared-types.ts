/**
 * Shared types used by both the Electron main process and the renderer.
 * Duplicated here because tsconfig.electron.json has rootDir: "electron/"
 * and cannot import from src/.
 *
 * Keep in sync with src/store/types.ts.
 */

export interface AnomalyEvent {
  id: string;
  severity: 'warning' | 'critical';
  narrative: string;
  timeline: TimelineEntry[];
  detectedAt: string;
}

export interface TimelineEntry {
  source: 'vercel' | 'sentry' | 'github' | 'posthog' | 'segment';
  label: string;
  detail: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
}
