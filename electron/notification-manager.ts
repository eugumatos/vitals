/**
 * Smart notification manager.
 *
 * - Batches rapid-fire events (e.g. 3 deploys finishing in 10s → single notification)
 * - Click-to-action: clicking opens the notch in the right state/integration
 * - Rich body with timeline context for anomalies
 * - Respects smart silence
 * - Sends in-app notification history to renderer
 */

import { Notification, BrowserWindow } from 'electron';
import { isInSilenceWindow } from './store';
import type { SmartSilenceConfig } from './store';
import type { AnomalyEvent } from './shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationPayload {
  id: string;
  kind: 'deploy' | 'anomaly' | 'action' | 'error';
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  sources: string[];
  targetIntegration?: string;
  targetState?: string;
  anomalyId?: string;
}

interface BatchEntry {
  payload: NotificationPayload;
  receivedAt: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let mainWindowRef: BrowserWindow | null = null;
let silenceConfigRef: SmartSilenceConfig = { enabled: false, startHour: 19, endHour: 8, weekends: true };

const BATCH_WINDOW_MS = 10_000; // batch events within 10s
const batchQueue: BatchEntry[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function setNotificationWindow(win: BrowserWindow | null): void {
  mainWindowRef = win;
}

export function setNotificationSilenceConfig(config: SmartSilenceConfig): void {
  silenceConfigRef = config;
}

/** Notify about a deploy completion */
export function notifyDeploy(project: string, success: boolean, detail: string): void {
  enqueue({
    id: `deploy:${project}:${Date.now()}`,
    kind: 'deploy',
    title: success ? 'Deploy succeeded' : 'Deploy failed',
    body: `${project} — ${detail}`,
    severity: success ? 'info' : 'critical',
    sources: ['vercel'],
    targetIntegration: 'vercel',
    targetState: 'hover',
  });
}

/** Notify about a GitHub Action completion */
export function notifyAction(name: string, repo: string, sha: string, success: boolean): void {
  enqueue({
    id: `action:${sha}:${name}:${Date.now()}`,
    kind: 'action',
    title: success ? 'Action succeeded' : 'Action failed',
    body: `${name} (${sha}) on ${repo}`,
    severity: success ? 'info' : 'warning',
    sources: ['github'],
    targetIntegration: 'github',
    targetState: success ? 'hover' : 'anomaly',
  });
}

/** Notify about a cross-service anomaly */
export function notifyAnomaly(event: AnomalyEvent): void {
  // Build a rich body from timeline entries
  const timelineLines = event.timeline
    .slice(0, 3)
    .map((t) => `${t.source}: ${t.label}`)
    .join('\n');

  enqueue({
    id: `anomaly:${event.id}`,
    kind: 'anomaly',
    title: event.severity === 'critical' ? 'Critical anomaly' : 'Anomaly detected',
    body: `${event.narrative}\n${timelineLines}`,
    severity: event.severity,
    sources: [...new Set(event.timeline.map((t) => t.source))],
    targetIntegration: event.timeline[0]?.source,
    targetState: 'anomaly',
    anomalyId: event.id,
  });
}

// ---------------------------------------------------------------------------
// Batching
// ---------------------------------------------------------------------------

function enqueue(payload: NotificationPayload): void {
  batchQueue.push({ payload, receivedAt: Date.now() });

  // Always send to renderer immediately (in-app history)
  sendToRenderer(payload);

  // Schedule batch flush
  if (!batchTimer) {
    batchTimer = setTimeout(flushBatch, BATCH_WINDOW_MS);
  }
}

function flushBatch(): void {
  batchTimer = null;
  if (batchQueue.length === 0) return;

  const entries = batchQueue.splice(0);

  // Group by kind
  const byKind = new Map<string, BatchEntry[]>();
  for (const entry of entries) {
    const list = byKind.get(entry.payload.kind) || [];
    list.push(entry);
    byKind.set(entry.payload.kind, list);
  }

  for (const [kind, kindEntries] of byKind) {
    if (kindEntries.length === 1) {
      // Single event — send as-is
      showNativeNotification(kindEntries[0].payload);
    } else if (kind === 'deploy') {
      // Multiple deploys — batch
      const successes = kindEntries.filter((e) => e.payload.severity === 'info');
      const failures = kindEntries.filter((e) => e.payload.severity !== 'info');
      if (failures.length > 0) {
        showNativeNotification({
          id: `batch:deploy:${Date.now()}`,
          kind: 'deploy',
          title: `${kindEntries.length} deploys completed`,
          body: failures.length > 0
            ? `${failures.length} failed, ${successes.length} succeeded`
            : `All ${successes.length} succeeded`,
          severity: failures.length > 0 ? 'critical' : 'info',
          sources: ['vercel'],
          targetIntegration: 'vercel',
          targetState: failures.length > 0 ? 'anomaly' : 'hover',
        });
      } else {
        showNativeNotification({
          id: `batch:deploy:${Date.now()}`,
          kind: 'deploy',
          title: `${successes.length} deploys succeeded`,
          body: successes.map((e) => e.payload.body.split(' — ')[0]).join(', '),
          severity: 'info',
          sources: ['vercel'],
          targetIntegration: 'vercel',
          targetState: 'hover',
        });
      }
    } else if (kind === 'action') {
      const failures = kindEntries.filter((e) => e.payload.severity !== 'info');
      const successes = kindEntries.filter((e) => e.payload.severity === 'info');
      showNativeNotification({
        id: `batch:action:${Date.now()}`,
        kind: 'action',
        title: `${kindEntries.length} actions completed`,
        body: failures.length > 0
          ? `${failures.length} failed, ${successes.length} succeeded`
          : `All ${successes.length} passed`,
        severity: failures.length > 0 ? 'warning' : 'info',
        sources: ['github'],
        targetIntegration: 'github',
        targetState: failures.length > 0 ? 'anomaly' : 'hover',
      });
    } else {
      // Anomalies or errors — send most severe one
      const sorted = kindEntries.sort((a, b) => {
        const order = { critical: 0, warning: 1, info: 2 };
        return (order[a.payload.severity] ?? 2) - (order[b.payload.severity] ?? 2);
      });
      const primary = sorted[0].payload;
      if (kindEntries.length > 1) {
        showNativeNotification({
          ...primary,
          title: `${primary.title} (+${kindEntries.length - 1} more)`,
        });
      } else {
        showNativeNotification(primary);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Native notification
// ---------------------------------------------------------------------------

function showNativeNotification(payload: NotificationPayload): void {
  // Skip during silence hours
  if (isInSilenceWindow(silenceConfigRef)) {
    console.log(`[vitals:notify] Skipped (silenced): ${payload.title}`);
    return;
  }

  console.log(`[vitals:notify] ${payload.title} — ${payload.body}`);

  try {
    const notification = new Notification({
      title: payload.title,
      body: payload.body,
      silent: payload.severity === 'info',
    });

    // Click-to-action: show notch and navigate to the right view
    notification.on('click', () => {
      if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
      mainWindowRef.show();
      mainWindowRef.setIgnoreMouseEvents(false);

      // Tell renderer to navigate
      mainWindowRef.webContents.send('notification:navigate', {
        integration: payload.targetIntegration,
        state: payload.targetState,
        notificationId: payload.id,
      });
    });

    notification.show();
  } catch (err) {
    console.error('[vitals:notify] Failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Renderer communication
// ---------------------------------------------------------------------------

function sendToRenderer(payload: NotificationPayload): void {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  mainWindowRef.webContents.send('notification:push', {
    id: payload.id,
    kind: payload.kind,
    title: payload.title,
    body: payload.body,
    severity: payload.severity,
    sources: payload.sources,
    targetIntegration: payload.targetIntegration,
    targetState: payload.targetState,
    anomalyId: payload.anomalyId,
    timestamp: new Date().toISOString(),
    read: false,
  });
}
