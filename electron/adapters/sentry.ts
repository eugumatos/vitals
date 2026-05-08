import { getToken, setToken } from '../store';
import type { Adapter, Snapshot, Anomaly } from './types';

const API_BASE = 'https://sentry.io/api/0';

export interface SentryIssue {
  id: string;
  title: string;
  culprit: string;
  level: 'fatal' | 'error' | 'warning' | 'info';
  status: string;
  count: string;
  firstSeen: string;
  lastSeen: string;
  isUnhandled: boolean;
  metadata: { type?: string; value?: string };
  shortId: string;
  project: { slug: string; name: string };
  permalink: string;
}

export interface SentrySnapshot {
  issues: Array<{
    id: string;
    title: string;
    culprit: string;
    level: string;
    count: number;
    firstSeen: string;
    lastSeen: string;
    isUnhandled: boolean;
    shortId: string;
    project: string;
    permalink: string;
    isNew: boolean;
  }>;
  stats: {
    totalErrors24h: number;
    unresolvedCount: number;
    newIssues24h: number;
  };
}

let _cachedToken: string | null = null;
let _orgSlug: string | null = null;
let snapshotHistory: Snapshot[] = [];

async function sentryFetch<T>(endpoint: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Sentry API ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

async function resolveOrg(token: string): Promise<string> {
  if (_orgSlug) return _orgSlug;

  const orgs = await sentryFetch<Array<{ slug: string }>>('/organizations/', token);
  if (orgs.length === 0) throw new Error('No Sentry organizations found');

  _orgSlug = orgs[0].slug;
  return _orgSlug;
}

async function fetchIssues(token: string, org: string): Promise<SentrySnapshot['issues']> {
  const issues = await sentryFetch<SentryIssue[]>(
    `/organizations/${org}/issues/?query=is:unresolved&sort=date&limit=15&statsPeriod=24h`,
    token
  );

  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  return issues.map((issue) => ({
    id: issue.id,
    title: issue.title,
    culprit: issue.culprit,
    level: issue.level,
    count: parseInt(issue.count, 10),
    firstSeen: issue.firstSeen,
    lastSeen: issue.lastSeen,
    isUnhandled: issue.isUnhandled,
    shortId: issue.shortId,
    project: issue.project?.slug || issue.project?.name || '',
    permalink: issue.permalink,
    isNew: new Date(issue.firstSeen).getTime() > dayAgo,
  }));
}

async function fetchStats(token: string, org: string): Promise<SentrySnapshot['stats']> {
  // Get project stats for error count
  try {
    const outcomes = await sentryFetch<any>(
      `/organizations/${org}/stats_v2/?field=sum(quantity)&category=error&interval=1h&statsPeriod=24h`,
      token
    );

    let totalErrors24h = 0;
    if (outcomes?.groups?.[0]?.totals?.['sum(quantity)']) {
      totalErrors24h = outcomes.groups[0].totals['sum(quantity)'];
    }

    // Count unresolved issues
    const issues = await sentryFetch<SentryIssue[]>(
      `/organizations/${org}/issues/?query=is:unresolved&limit=1`,
      token
    );

    // Use the X-Hits header if available, otherwise use length
    const unresolvedCount = issues.length;

    // Count new issues in last 24h
    const newIssues = await sentryFetch<SentryIssue[]>(
      `/organizations/${org}/issues/?query=is:unresolved+firstSeen:-24h&limit=1`,
      token
    );

    return {
      totalErrors24h,
      unresolvedCount,
      newIssues24h: newIssues.length,
    };
  } catch {
    return { totalErrors24h: 0, unresolvedCount: 0, newIssues24h: 0 };
  }
}

export const sentryAdapter: Adapter = {
  name: 'sentry',

  isConfigured(): boolean {
    return _cachedToken !== null;
  },

  async fetchSnapshot(): Promise<Snapshot> {
    const token = await getToken('sentry');
    if (!token) throw new Error('Sentry not configured');
    _cachedToken = token;

    const org = await resolveOrg(token);
    const [issues, stats] = await Promise.all([
      fetchIssues(token, org),
      fetchStats(token, org),
    ]);

    const snapshot: Snapshot = {
      source: 'sentry',
      timestamp: Date.now(),
      data: { issues, stats } as unknown as Record<string, any>,
    };

    snapshotHistory.push(snapshot);
    if (snapshotHistory.length > 120) {
      snapshotHistory = snapshotHistory.slice(-120);
    }

    return snapshot;
  },

  detectAnomalies(history: Snapshot[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const latest = history[history.length - 1];
    if (!latest) return anomalies;

    const data = latest.data as unknown as SentrySnapshot;

    // High-volume unhandled errors
    const unhandled = data.issues.filter((i) => i.isUnhandled && i.count > 50);
    if (unhandled.length > 0) {
      anomalies.push({
        source: 'sentry',
        severity: 'warning',
        label: `${unhandled.length} high-volume unhandled error${unhandled.length > 1 ? 's' : ''}`,
        detail: unhandled.map((i) => `${i.project}: ${i.title} (${i.count}x)`).join(', '),
        timestamp: latest.timestamp,
      });
    }

    // New issues spike (5+ new issues in 24h)
    const newIssues = data.issues.filter((i) => i.isNew);
    if (newIssues.length >= 5) {
      anomalies.push({
        source: 'sentry',
        severity: 'critical',
        label: `${newIssues.length} new issues in 24h`,
        detail: newIssues.slice(0, 3).map((i) => i.title).join(', '),
        timestamp: latest.timestamp,
      });
    }

    return anomalies;
  },
};

export async function initAdapter(): Promise<void> {
  const token = await getToken('sentry');
  _cachedToken = token || null;
}

export async function setSentryToken(token: string): Promise<void> {
  await setToken('sentry', token);
  _cachedToken = token;
  _orgSlug = null; // re-resolve on next fetch
}

export async function disconnectSentry(): Promise<void> {
  const { removeToken } = await import('../store');
  await removeToken('sentry');
  _cachedToken = null;
  _orgSlug = null;
}

export function getSnapshotHistory(): Snapshot[] {
  return snapshotHistory;
}
