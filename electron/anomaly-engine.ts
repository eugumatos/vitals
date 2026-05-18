/**
 * Cross-service anomaly detection engine.
 *
 * Runs in the main process. Each polling callback feeds its latest snapshot
 * into the engine via `ingest()`. After every ingestion the engine evaluates
 * a set of correlation rules and, when a new anomaly is detected, calls the
 * registered callback.
 */

import type { AnomalyEvent, TimelineEntry } from './shared-types';

// ---------------------------------------------------------------------------
// Internal snapshot history
// ---------------------------------------------------------------------------

interface SentrySnapshot {
  totalErrors24h: number;
  newIssues24h: number;
  unresolvedCount: number;
  issues: Array<{
    id: string;
    title: string;
    project: string;
    isNew: boolean;
    isUnhandled: boolean;
    count: number;
    firstSeen: string;
    lastSeen: string;
  }>;
  timestamp: number;
}

interface VercelSnapshot {
  deployments: Array<{
    uid: string;
    project: string;
    state: string;
    sha: string;
    message: string;
    branch: string;
    createdAt: string;
    readyAt: string | null;
  }>;
  timestamp: number;
}

interface GitHubSnapshot {
  actions: Array<{
    name: string;
    sha: string;
    fullSha: string;
    repo: string;
    repoFullName: string;
    conclusion: string | null;
    status: string;
    updatedAt: string;
  }>;
  timestamp: number;
}

// Keep a short rolling window per service
const WINDOW_SIZE = 10;
const sentryHistory: SentrySnapshot[] = [];
const vercelHistory: VercelSnapshot[] = [];
const githubHistory: GitHubSnapshot[] = [];

// Track emitted anomalies to avoid duplicates (id → expiry timestamp)
const emittedIds = new Map<string, number>();
const ANOMALY_COOLDOWN_MS = 5 * 60 * 1000; // don't re-emit same anomaly for 5 min

// ---------------------------------------------------------------------------
// Callback
// ---------------------------------------------------------------------------

type AnomalyCallback = (event: AnomalyEvent) => void;
let onAnomaly: AnomalyCallback | null = null;

export function setAnomalyCallback(cb: AnomalyCallback | null): void {
  onAnomaly = cb;
}

// ---------------------------------------------------------------------------
// Public API — call from polling callbacks
// ---------------------------------------------------------------------------

export function ingestSentry(raw: any): void {
  if (!raw) return;
  const snap: SentrySnapshot = {
    totalErrors24h: raw.stats?.totalErrors24h ?? 0,
    newIssues24h: raw.stats?.newIssues24h ?? 0,
    unresolvedCount: raw.stats?.unresolvedCount ?? 0,
    issues: (raw.issues || []).map((i: any) => ({
      id: i.id,
      title: i.title,
      project: i.project,
      isNew: i.isNew,
      isUnhandled: i.isUnhandled,
      count: i.count,
      firstSeen: i.firstSeen,
      lastSeen: i.lastSeen,
    })),
    timestamp: Date.now(),
  };
  sentryHistory.push(snap);
  if (sentryHistory.length > WINDOW_SIZE) sentryHistory.shift();
  evaluate();
}

export function ingestVercel(raw: any): void {
  if (!raw) return;
  const snap: VercelSnapshot = {
    deployments: (raw.deployments || []).map((d: any) => ({
      uid: d.uid,
      project: d.project,
      state: d.state,
      sha: d.sha,
      message: d.message,
      branch: d.branch,
      createdAt: d.createdAt,
      readyAt: d.readyAt,
    })),
    timestamp: Date.now(),
  };
  vercelHistory.push(snap);
  if (vercelHistory.length > WINDOW_SIZE) vercelHistory.shift();
  evaluate();
}

export function ingestGitHub(raw: any): void {
  if (!raw) return;
  const snap: GitHubSnapshot = {
    actions: (raw.actions?.recentRuns || []).map((r: any) => ({
      name: r.name,
      sha: r.sha,
      fullSha: r.fullSha || r.sha,
      repo: r.repo || '',
      repoFullName: r.repoFullName || '',
      conclusion: r.conclusion,
      status: r.status,
      updatedAt: r.updatedAt,
    })),
    timestamp: Date.now(),
  };
  githubHistory.push(snap);
  if (githubHistory.length > WINDOW_SIZE) githubHistory.shift();
  evaluate();
}

// ---------------------------------------------------------------------------
// Evaluation — run all correlation rules
// ---------------------------------------------------------------------------

function evaluate(): void {
  if (!onAnomaly) return;
  pruneEmitted();

  const anomalies: AnomalyEvent[] = [
    ...checkDeployErrorCorrelation(),
    ...checkErrorSurge(),
    ...checkCICascade(),
    ...checkMultiServiceDegradation(),
  ];

  for (const a of anomalies) {
    if (!emittedIds.has(a.id)) {
      emittedIds.set(a.id, Date.now() + ANOMALY_COOLDOWN_MS);
      onAnomaly(a);
    }
  }
}

function pruneEmitted(): void {
  const now = Date.now();
  for (const [id, expiry] of emittedIds) {
    if (now > expiry) emittedIds.delete(id);
  }
}

function makeId(...parts: string[]): string {
  return parts.join(':');
}

// ---------------------------------------------------------------------------
// Rule 1: Deploy completed → Sentry error spike within the correlation window
// ---------------------------------------------------------------------------

const DEPLOY_ERROR_WINDOW_MS = 10 * 60 * 1000; // 10 min

function checkDeployErrorCorrelation(): AnomalyEvent[] {
  const results: AnomalyEvent[] = [];
  const latestSentry = sentryHistory[sentryHistory.length - 1];
  const prevSentry = sentryHistory.length >= 2 ? sentryHistory[sentryHistory.length - 2] : null;
  if (!latestSentry || !prevSentry) return results;

  // Check if errors increased significantly
  const errorDelta = latestSentry.totalErrors24h - prevSentry.totalErrors24h;
  const errorRatio = prevSentry.totalErrors24h > 0
    ? latestSentry.totalErrors24h / prevSentry.totalErrors24h
    : (latestSentry.totalErrors24h > 5 ? 2 : 0);

  if (errorRatio < 1.5 && errorDelta < 10) return results;

  // Look for a recent deploy that completed
  const latestVercel = vercelHistory[vercelHistory.length - 1];
  if (!latestVercel) return results;

  const recentDeploys = latestVercel.deployments.filter((d) => {
    if (d.state !== 'READY') return false;
    const readyAt = d.readyAt ? new Date(d.readyAt).getTime() : 0;
    return readyAt > 0 && (Date.now() - readyAt) < DEPLOY_ERROR_WINDOW_MS;
  });

  for (const deploy of recentDeploys) {
    const id = makeId('deploy-error', deploy.uid);
    const timeline: TimelineEntry[] = [
      {
        source: 'vercel',
        label: `Deploy completed`,
        detail: `${deploy.project} — ${deploy.sha?.slice(0, 7)} on ${deploy.branch}`,
        timestamp: deploy.readyAt || deploy.createdAt,
        severity: 'info',
      },
      {
        source: 'sentry',
        label: `Error spike detected`,
        detail: `${latestSentry.totalErrors24h} errors (+${errorDelta} since last check)`,
        timestamp: new Date().toISOString(),
        severity: errorRatio >= 2 ? 'critical' : 'warning',
      },
    ];

    // Add new issues to timeline
    const newIssues = latestSentry.issues.filter((i) => i.isNew);
    for (const issue of newIssues.slice(0, 3)) {
      timeline.push({
        source: 'sentry',
        label: issue.title,
        detail: `${issue.project} — ${issue.count}x`,
        timestamp: issue.firstSeen,
        severity: 'warning',
      });
    }

    results.push({
      id,
      severity: errorRatio >= 2 ? 'critical' : 'warning',
      narrative: `Errors spiked ${errorRatio >= 2 ? `${errorRatio.toFixed(1)}x` : `+${errorDelta}`} after ${deploy.project} deploy (${deploy.sha?.slice(0, 7)}).`,
      timeline,
      detectedAt: new Date().toISOString(),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Rule 2: Sentry error surge (independent of deploys)
// ---------------------------------------------------------------------------

function checkErrorSurge(): AnomalyEvent[] {
  if (sentryHistory.length < 3) return [];
  const latest = sentryHistory[sentryHistory.length - 1];
  // Compute a baseline from older snapshots (excluding the last 2)
  const baseline = sentryHistory.slice(0, -2);
  if (baseline.length === 0) return [];

  const avgErrors = baseline.reduce((sum, s) => sum + s.totalErrors24h, 0) / baseline.length;
  if (avgErrors === 0 && latest.totalErrors24h < 20) return [];

  const ratio = avgErrors > 0 ? latest.totalErrors24h / avgErrors : 0;
  if (ratio < 2) return [];

  const id = makeId('error-surge', String(Math.floor(Date.now() / (5 * 60 * 1000))));

  const timeline: TimelineEntry[] = [
    {
      source: 'sentry',
      label: 'Error surge detected',
      detail: `${latest.totalErrors24h} errors vs baseline ${Math.round(avgErrors)}`,
      timestamp: new Date().toISOString(),
      severity: ratio >= 3 ? 'critical' : 'warning',
    },
  ];

  const newUnhandled = latest.issues.filter((i) => i.isNew || i.isUnhandled);
  for (const issue of newUnhandled.slice(0, 3)) {
    timeline.push({
      source: 'sentry',
      label: issue.title,
      detail: `${issue.project} — ${issue.count}x`,
      timestamp: issue.lastSeen,
      severity: issue.isUnhandled ? 'critical' : 'warning',
    });
  }

  return [{
    id,
    severity: ratio >= 3 ? 'critical' : 'warning',
    narrative: `Sentry errors surged ${ratio.toFixed(1)}x above baseline (${latest.totalErrors24h} vs avg ${Math.round(avgErrors)}).`,
    timeline,
    detectedAt: new Date().toISOString(),
  }];
}

// ---------------------------------------------------------------------------
// Rule 3: CI cascade — multiple actions failing in short window
// ---------------------------------------------------------------------------

function checkCICascade(): AnomalyEvent[] {
  const latest = githubHistory[githubHistory.length - 1];
  if (!latest) return [];

  const failedActions = latest.actions.filter((a) => a.conclusion === 'failure');
  if (failedActions.length < 3) return [];

  // Check if failures are across multiple repos (more severe)
  const repos = new Set(failedActions.map((a) => a.repoFullName || a.repo));

  const id = makeId('ci-cascade', String(Math.floor(Date.now() / (5 * 60 * 1000))));
  const severity = repos.size >= 2 ? 'critical' as const : 'warning' as const;

  const timeline: TimelineEntry[] = failedActions.slice(0, 5).map((a) => ({
    source: 'github' as const,
    label: `${a.name} failed`,
    detail: `${a.repoFullName || a.repo} — ${a.sha?.slice(0, 7)}`,
    timestamp: a.updatedAt,
    severity: 'warning' as const,
  }));

  return [{
    id,
    severity,
    narrative: `${failedActions.length} CI failures${repos.size >= 2 ? ` across ${repos.size} repos` : ''} — pipeline may be broken.`,
    timeline,
    detectedAt: new Date().toISOString(),
  }];
}

// ---------------------------------------------------------------------------
// Rule 4: Multi-service degradation — problems in 2+ services simultaneously
// ---------------------------------------------------------------------------

function checkMultiServiceDegradation(): AnomalyEvent[] {
  const signals: TimelineEntry[] = [];

  // Check GitHub for failures
  const latestGH = githubHistory[githubHistory.length - 1];
  if (latestGH) {
    const failures = latestGH.actions.filter((a) => a.conclusion === 'failure');
    if (failures.length >= 2) {
      signals.push({
        source: 'github',
        label: `${failures.length} CI failures`,
        detail: failures.slice(0, 2).map((f) => f.name).join(', '),
        timestamp: failures[0]?.updatedAt || new Date().toISOString(),
        severity: 'warning',
      });
    }
  }

  // Check Vercel for failed deploys
  const latestVC = vercelHistory[vercelHistory.length - 1];
  if (latestVC) {
    const failedDeploys = latestVC.deployments.filter((d) => d.state === 'ERROR');
    if (failedDeploys.length > 0) {
      signals.push({
        source: 'vercel',
        label: `${failedDeploys.length} deploy failure${failedDeploys.length > 1 ? 's' : ''}`,
        detail: failedDeploys.map((d) => d.project).join(', '),
        timestamp: failedDeploys[0]?.createdAt || new Date().toISOString(),
        severity: 'warning',
      });
    }
  }

  // Check Sentry for elevated errors
  const latestSentry = sentryHistory[sentryHistory.length - 1];
  if (latestSentry) {
    const newUnhandled = latestSentry.issues.filter((i) => i.isNew || i.isUnhandled);
    if (newUnhandled.length >= 3) {
      signals.push({
        source: 'sentry',
        label: `${newUnhandled.length} new/unhandled issues`,
        detail: newUnhandled.slice(0, 2).map((i) => i.title).join(', '),
        timestamp: new Date().toISOString(),
        severity: 'warning',
      });
    }
  }

  // Need signals from at least 2 different services
  const sources = new Set(signals.map((s) => s.source));
  if (sources.size < 2) return [];

  const id = makeId('multi-service', String(Math.floor(Date.now() / (5 * 60 * 1000))));

  return [{
    id,
    severity: signals.some((s) => s.severity === 'critical') ? 'critical' : 'warning',
    narrative: `Degradation across ${sources.size} services: ${[...sources].join(', ')}.`,
    timeline: signals,
    detectedAt: new Date().toISOString(),
  }];
}
