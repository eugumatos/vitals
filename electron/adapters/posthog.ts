import { getToken, setToken } from '../store';
import type { Adapter, Snapshot, Anomaly } from './types';

export interface PostHogSnapshot {
  insights: Array<{
    id: number;
    name: string;
    description: string;
    lastModified: string;
    result: any;
  }>;
  events: {
    totalLast24h: number;
    uniquePersons: number;
    topEvents: Array<{
      event: string;
      count: number;
    }>;
  };
  featureFlags: Array<{
    id: number;
    key: string;
    name: string;
    active: boolean;
    rolloutPercentage: number | null;
  }>;
}

let _cachedToken: string | null = null;
let _projectId: string | null = null;
let _host = 'https://app.posthog.com';
let snapshotHistory: Snapshot[] = [];

function parseToken(token: string): { apiKey: string; projectId: string; host: string } {
  // Format: "apiKey:projectId" or "apiKey:projectId:host"
  const parts = token.split(':');
  if (parts.length < 2) throw new Error('Invalid PostHog token format. Use "API_KEY:PROJECT_ID" or "API_KEY:PROJECT_ID:HOST"');
  return {
    apiKey: parts[0],
    projectId: parts[1],
    host: parts[2] || 'https://app.posthog.com',
  };
}

async function posthogFetch<T>(endpoint: string, apiKey: string, host: string): Promise<T> {
  const res = await fetch(`${host}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`PostHog API ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

async function fetchEvents(apiKey: string, projectId: string, host: string): Promise<PostHogSnapshot['events']> {
  try {
    const data = await posthogFetch<any>(
      `/api/projects/${projectId}/events/?limit=100&orderBy=-timestamp`,
      apiKey,
      host
    );

    const events = data.results || [];
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    const recentEvents = events.filter((e: any) => new Date(e.timestamp).getTime() > dayAgo);
    const persons = new Set(recentEvents.map((e: any) => e.distinct_id).filter(Boolean));

    // Count by event name
    const eventCounts: Record<string, number> = {};
    for (const e of recentEvents) {
      const name = e.event || 'unknown';
      eventCounts[name] = (eventCounts[name] || 0) + 1;
    }

    const topEvents = Object.entries(eventCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([event, count]) => ({ event, count }));

    return {
      totalLast24h: recentEvents.length,
      uniquePersons: persons.size,
      topEvents,
    };
  } catch {
    return { totalLast24h: 0, uniquePersons: 0, topEvents: [] };
  }
}

async function fetchFeatureFlags(apiKey: string, projectId: string, host: string): Promise<PostHogSnapshot['featureFlags']> {
  try {
    const data = await posthogFetch<any>(
      `/api/projects/${projectId}/feature_flags/?limit=30`,
      apiKey,
      host
    );

    return (data.results || []).map((f: any) => ({
      id: f.id,
      key: f.key,
      name: f.name || f.key,
      active: f.active,
      rolloutPercentage: f.filters?.groups?.[0]?.rollout_percentage ?? null,
    }));
  } catch {
    return [];
  }
}

async function fetchInsights(apiKey: string, projectId: string, host: string): Promise<PostHogSnapshot['insights']> {
  try {
    const data = await posthogFetch<any>(
      `/api/projects/${projectId}/insights/?limit=10&order=-last_modified_at`,
      apiKey,
      host
    );

    return (data.results || []).map((i: any) => ({
      id: i.id,
      name: i.name || 'Untitled',
      description: (i.description || '').slice(0, 200),
      lastModified: i.last_modified_at,
      result: i.result,
    }));
  } catch {
    return [];
  }
}

export const posthogAdapter: Adapter = {
  name: 'posthog',

  isConfigured(): boolean {
    return _cachedToken !== null;
  },

  async fetchSnapshot(): Promise<Snapshot> {
    const token = await getToken('posthog');
    if (!token) throw new Error('PostHog not configured');
    _cachedToken = token;

    const { apiKey, projectId, host } = parseToken(token);
    _projectId = projectId;
    _host = host;

    const [events, featureFlags, insights] = await Promise.all([
      fetchEvents(apiKey, projectId, host),
      fetchFeatureFlags(apiKey, projectId, host),
      fetchInsights(apiKey, projectId, host),
    ]);

    const snapshot: Snapshot = {
      source: 'posthog',
      timestamp: Date.now(),
      data: { events, featureFlags, insights } as unknown as Record<string, any>,
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

    const data = latest.data as unknown as PostHogSnapshot;

    // Event volume drop (might indicate tracking issue)
    if (data.events.totalLast24h === 0) {
      anomalies.push({
        source: 'posthog',
        severity: 'warning',
        label: 'No events received in last 24h',
        detail: 'Event tracking may be broken or the project has no activity',
        timestamp: latest.timestamp,
      });
    }

    // Many feature flags disabled
    const activeFlags = data.featureFlags.filter((f) => f.active);
    const inactiveFlags = data.featureFlags.filter((f) => !f.active);
    if (inactiveFlags.length > 10 && inactiveFlags.length > activeFlags.length * 2) {
      anomalies.push({
        source: 'posthog',
        severity: 'warning',
        label: `${inactiveFlags.length} inactive feature flags`,
        detail: 'Consider cleaning up stale feature flags',
        timestamp: latest.timestamp,
      });
    }

    return anomalies;
  },
};

export async function initAdapter(): Promise<void> {
  const token = await getToken('posthog');
  _cachedToken = token || null;
  if (token) {
    try {
      const { projectId, host } = parseToken(token);
      _projectId = projectId;
      _host = host;
    } catch {
      _cachedToken = null;
    }
  }
}

export async function setPostHogToken(token: string): Promise<void> {
  parseToken(token); // validate format
  await setToken('posthog', token);
  _cachedToken = token;
  const { projectId, host } = parseToken(token);
  _projectId = projectId;
  _host = host;
}

export async function disconnectPostHog(): Promise<void> {
  const { removeToken } = await import('../store');
  await removeToken('posthog');
  _cachedToken = null;
  _projectId = null;
}

export function getSnapshotHistory(): Snapshot[] {
  return snapshotHistory;
}
