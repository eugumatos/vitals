import { getToken, setToken } from '../store';
import type { Adapter, Snapshot, Anomaly } from './types';

const API_BASE = 'https://api.supabase.com';

export interface SupabaseSnapshot {
  projects: Array<{
    id: string;
    name: string;
    organizationId: string;
    region: string;
    status: string;
    createdAt: string;
    databaseSize: number | null;
    activeConnections: number | null;
  }>;
  stats: {
    totalProjects: number;
    healthy: number;
    unhealthy: number;
    inactive: number;
  };
}

let _cachedToken: string | null = null;
let snapshotHistory: Snapshot[] = [];

async function supabaseFetch<T>(endpoint: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Supabase API ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

async function fetchProjects(token: string): Promise<SupabaseSnapshot['projects']> {
  const projects = await supabaseFetch<any[]>('/v1/projects', token);

  const enriched = await Promise.all(
    projects.map(async (p: any) => {
      let databaseSize: number | null = null;
      let activeConnections: number | null = null;

      // Try to fetch health/status info per project
      try {
        const health = await supabaseFetch<any>(`/v1/projects/${p.ref}/health`, token);
        if (health?.database) {
          databaseSize = health.database.size ?? null;
          activeConnections = health.database.active_connections ?? null;
        }
      } catch {
        // Health endpoint may not be available, fallback gracefully
      }

      return {
        id: p.ref || p.id,
        name: p.name,
        organizationId: p.organization_id || '',
        region: p.region || '',
        status: p.status || 'UNKNOWN',
        createdAt: p.created_at || '',
        databaseSize,
        activeConnections,
      };
    })
  );

  return enriched;
}

export const supabaseAdapter: Adapter = {
  name: 'supabase',

  isConfigured(): boolean {
    return _cachedToken !== null;
  },

  async fetchSnapshot(): Promise<Snapshot> {
    const token = await getToken('supabase');
    if (!token) throw new Error('Supabase not configured');
    _cachedToken = token;

    const projects = await fetchProjects(token);

    const stats = {
      totalProjects: projects.length,
      healthy: projects.filter((p) => p.status === 'ACTIVE_HEALTHY').length,
      unhealthy: projects.filter((p) => p.status === 'ACTIVE_UNHEALTHY').length,
      inactive: projects.filter(
        (p) => p.status !== 'ACTIVE_HEALTHY' && p.status !== 'ACTIVE_UNHEALTHY'
      ).length,
    };

    const snapshot: Snapshot = {
      source: 'supabase',
      timestamp: Date.now(),
      data: { projects, stats } as unknown as Record<string, any>,
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

    const data = latest.data as unknown as SupabaseSnapshot;

    // Unhealthy projects
    if (data.stats.unhealthy >= 1) {
      const unhealthyNames = data.projects
        .filter((p) => p.status === 'ACTIVE_UNHEALTHY')
        .slice(0, 3)
        .map((p) => p.name)
        .join(', ');

      anomalies.push({
        source: 'supabase',
        severity: 'warning',
        label: `${data.stats.unhealthy} unhealthy project${data.stats.unhealthy > 1 ? 's' : ''}`,
        detail: unhealthyNames,
        timestamp: latest.timestamp,
      });
    }

    // Critical: multiple unhealthy projects
    if (data.stats.unhealthy >= 3) {
      anomalies.push({
        source: 'supabase',
        severity: 'critical',
        label: `${data.stats.unhealthy} Supabase projects unhealthy`,
        detail: `${data.stats.healthy} healthy, ${data.stats.inactive} inactive`,
        timestamp: latest.timestamp,
      });
    }

    // No projects at all (possible token/access issue)
    if (data.stats.totalProjects === 0) {
      anomalies.push({
        source: 'supabase',
        severity: 'warning',
        label: 'No Supabase projects found',
        detail: 'Check if the access token has the correct permissions',
        timestamp: latest.timestamp,
      });
    }

    return anomalies;
  },
};

export async function initAdapter(): Promise<void> {
  const token = await getToken('supabase');
  _cachedToken = token || null;
}

export async function setSupabaseToken(token: string): Promise<void> {
  // Validate by attempting to list projects
  await supabaseFetch('/v1/projects', token);
  await setToken('supabase', token);
  _cachedToken = token;
}

export async function disconnectSupabase(): Promise<void> {
  await (await import('../store')).removeToken('supabase');
  _cachedToken = null;
}

export function getSnapshotHistory(): Snapshot[] {
  return snapshotHistory;
}
