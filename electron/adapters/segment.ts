import { getToken, setToken } from '../store';
import type { Adapter, Snapshot, Anomaly } from './types';

const API_BASE = 'https://api.segmentapis.com';

export interface SegmentSnapshot {
  sources: Array<{
    id: string;
    name: string;
    slug: string;
    enabled: boolean;
    writeKeys: string[];
    sourceType: string;
  }>;
  destinations: Array<{
    id: string;
    name: string;
    enabled: boolean;
    sourceId: string;
    destinationType: string;
  }>;
  stats: {
    totalSources: number;
    activeSources: number;
    totalDestinations: number;
    activeDestinations: number;
  };
}

let _cachedToken: string | null = null;
let snapshotHistory: Snapshot[] = [];

async function segmentFetch<T>(endpoint: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Segment API ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

async function fetchSources(token: string): Promise<SegmentSnapshot['sources']> {
  try {
    const data = await segmentFetch<any>('/sources', token);

    return (data.data?.sources || []).map((s: any) => ({
      id: s.id,
      name: s.name || s.slug,
      slug: s.slug,
      enabled: s.enabled !== false,
      writeKeys: s.writeKeys || [],
      sourceType: s.metadata?.name || 'unknown',
    }));
  } catch {
    return [];
  }
}

async function fetchDestinations(token: string): Promise<SegmentSnapshot['destinations']> {
  try {
    const data = await segmentFetch<any>('/destinations', token);

    return (data.data?.destinations || []).map((d: any) => ({
      id: d.id,
      name: d.name || d.id,
      enabled: d.enabled !== false,
      sourceId: d.sourceId || '',
      destinationType: d.metadata?.name || 'unknown',
    }));
  } catch {
    return [];
  }
}

export const segmentAdapter: Adapter = {
  name: 'segment',

  isConfigured(): boolean {
    return _cachedToken !== null;
  },

  async fetchSnapshot(): Promise<Snapshot> {
    const token = await getToken('segment');
    if (!token) throw new Error('Segment not configured');
    _cachedToken = token;

    const [sources, destinations] = await Promise.all([
      fetchSources(token),
      fetchDestinations(token),
    ]);

    const stats = {
      totalSources: sources.length,
      activeSources: sources.filter((s) => s.enabled).length,
      totalDestinations: destinations.length,
      activeDestinations: destinations.filter((d) => d.enabled).length,
    };

    const snapshot: Snapshot = {
      source: 'segment',
      timestamp: Date.now(),
      data: { sources, destinations, stats } as unknown as Record<string, any>,
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

    const data = latest.data as unknown as SegmentSnapshot;

    // Disabled sources
    const disabledSources = data.sources.filter((s) => !s.enabled);
    if (disabledSources.length > 0) {
      anomalies.push({
        source: 'segment',
        severity: 'warning',
        label: `${disabledSources.length} disabled source${disabledSources.length > 1 ? 's' : ''}`,
        detail: disabledSources.map((s) => s.name).join(', '),
        timestamp: latest.timestamp,
      });
    }

    // Disabled destinations
    const disabledDests = data.destinations.filter((d) => !d.enabled);
    if (disabledDests.length >= 3) {
      anomalies.push({
        source: 'segment',
        severity: 'warning',
        label: `${disabledDests.length} disabled destinations`,
        detail: disabledDests.slice(0, 3).map((d) => d.name).join(', '),
        timestamp: latest.timestamp,
      });
    }

    // No active sources at all
    if (data.stats.activeSources === 0 && data.stats.totalSources > 0) {
      anomalies.push({
        source: 'segment',
        severity: 'critical',
        label: 'All sources are disabled',
        detail: `${data.stats.totalSources} sources configured but none active`,
        timestamp: latest.timestamp,
      });
    }

    return anomalies;
  },
};

export async function initAdapter(): Promise<void> {
  const token = await getToken('segment');
  _cachedToken = token || null;
}

export async function setSegmentToken(token: string): Promise<void> {
  await setToken('segment', token);
  _cachedToken = token;
}

export async function disconnectSegment(): Promise<void> {
  const { removeToken } = await import('../store');
  await removeToken('segment');
  _cachedToken = null;
}

export function getSnapshotHistory(): Snapshot[] {
  return snapshotHistory;
}
