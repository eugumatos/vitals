import { getToken, setToken } from '../store';
import type { Adapter, Snapshot, Anomaly } from './types';

const API_BASE = 'https://api.supabase.com';

export interface SupabaseProject {
  id: string;
  name: string;
  region: string;
  status: string;
  databaseSize: number | null;
  activeConnections: number | null;
  diskUsedGb: number | null;
  diskTotalGb: number | null;
  diskPercent: number | null;
  edgeFunctions: number;
  advisors: { performance: number; security: number };
}

export interface SupabaseSnapshot {
  projects: SupabaseProject[];
  stats: {
    totalProjects: number;
    healthy: number;
    unhealthy: number;
    inactive: number;
    totalFunctions: number;
    totalAdvisors: number;
  };
}

let _cachedToken: string | null = null;
let snapshotHistory: Snapshot[] = [];
let _pollCycle = 0;
let _projectRotation = 0;
let _forceFullRefresh = false;
const _lastProjectData = new Map<string, SupabaseProject>();

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

async function safeFetch<T>(endpoint: string, token: string, fallback: T): Promise<T> {
  try {
    return await supabaseFetch<T>(endpoint, token);
  } catch {
    return fallback;
  }
}

async function fetchProjects(token: string): Promise<SupabaseProject[]> {
  const projects = await supabaseFetch<any[]>('/v1/projects', token);

  const fetchAdvisors = _pollCycle % 5 === 0 || _forceFullRefresh;
  const rotationStart = _projectRotation % projects.length;

  const enriched = await Promise.all(
    projects.map(async (p: any, index: number) => {
      const ref = p.ref || p.id;

      // Determine if this project is in the round-robin window for this cycle
      const normalizedIndex = ((index - rotationStart) + projects.length) % projects.length;
      const inWindow = normalizedIndex < 3 || _forceFullRefresh;

      if (!inWindow) {
        // Reuse last known data for projects outside the window
        const cached = _lastProjectData.get(ref);
        if (cached) {
          return { ...cached, status: p.status || cached.status };
        }
      }

      // Fetch core enrichment data in parallel (always for in-window projects)
      const advisorFallback = _lastProjectData.get(ref)?.advisors ?? { performance: 0, security: 0 };

      const [health, disk, functions, perfAdvisors, secAdvisors] = await Promise.all([
        safeFetch<any>(`/v1/projects/${ref}/health`, token, null),
        safeFetch<any>(`/v1/projects/${ref}/config/disk/util`, token, null),
        safeFetch<any[]>(`/v1/projects/${ref}/functions`, token, []),
        fetchAdvisors
          ? safeFetch<any>(`/v1/projects/${ref}/advisors/performance`, token, [])
          : Promise.resolve(null),
        fetchAdvisors
          ? safeFetch<any>(`/v1/projects/${ref}/advisors/security`, token, [])
          : Promise.resolve(null),
      ]);

      const databaseSize = health?.database?.size ?? null;
      const activeConnections = health?.database?.active_connections ?? null;

      // Disk utilization
      let diskUsedGb: number | null = null;
      let diskTotalGb: number | null = null;
      let diskPercent: number | null = null;
      if (disk) {
        diskUsedGb = disk.used_gb ?? disk.used ?? null;
        diskTotalGb = disk.total_gb ?? disk.total ?? null;
        if (diskUsedGb != null && diskTotalGb != null && diskTotalGb > 0) {
          diskPercent = Math.round((diskUsedGb / diskTotalGb) * 100);
        } else if (disk.percent != null || disk.disk_usage_percent != null) {
          diskPercent = disk.percent ?? disk.disk_usage_percent;
        }
      }

      // Advisors count (only warnings/errors); reuse last known data on non-advisor cycles
      let advisors: { performance: number; security: number };
      if (fetchAdvisors && perfAdvisors !== null && secAdvisors !== null) {
        const perfLints = Array.isArray(perfAdvisors) ? perfAdvisors : (perfAdvisors?.data ?? []);
        const secLints = Array.isArray(secAdvisors) ? secAdvisors : (secAdvisors?.data ?? []);
        advisors = { performance: perfLints.length, security: secLints.length };
      } else {
        advisors = advisorFallback;
      }

      const result: SupabaseProject = {
        id: ref,
        name: p.name,
        region: p.region || '',
        status: p.status || 'UNKNOWN',
        databaseSize,
        activeConnections,
        diskUsedGb,
        diskTotalGb,
        diskPercent,
        edgeFunctions: Array.isArray(functions) ? functions.length : 0,
        advisors,
      };

      _lastProjectData.set(ref, result);
      return result;
    })
  );

  // Advance round-robin position by 3 for next cycle
  _projectRotation = (_projectRotation + 3) % Math.max(projects.length, 1);

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

    _pollCycle += 1;
    const projects = await fetchProjects(token);
    _forceFullRefresh = false; // reset after use

    let totalFunctions = 0;
    let totalAdvisors = 0;
    for (const p of projects) {
      totalFunctions += p.edgeFunctions;
      totalAdvisors += p.advisors.performance + p.advisors.security;
    }

    const stats = {
      totalProjects: projects.length,
      healthy: projects.filter((p) => p.status === 'ACTIVE_HEALTHY').length,
      unhealthy: projects.filter((p) => p.status === 'ACTIVE_UNHEALTHY').length,
      inactive: projects.filter(
        (p) => p.status !== 'ACTIVE_HEALTHY' && p.status !== 'ACTIVE_UNHEALTHY'
      ).length,
      totalFunctions,
      totalAdvisors,
    };

    const snapshot: Snapshot = {
      source: 'supabase',
      timestamp: Date.now(),
      data: { projects, stats } as unknown as Record<string, any>,
    };

    snapshotHistory.push(snapshot);
    if (snapshotHistory.length > 30) {
      snapshotHistory = snapshotHistory.slice(-30);
    }

    return snapshot;
  },

  detectAnomalies(history: Snapshot[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const latest = history[history.length - 1];
    if (!latest) return anomalies;

    const data = latest.data as unknown as SupabaseSnapshot;

    if (data.stats.unhealthy >= 1) {
      const names = data.projects
        .filter((p) => p.status === 'ACTIVE_UNHEALTHY')
        .slice(0, 3)
        .map((p) => p.name)
        .join(', ');
      anomalies.push({
        source: 'supabase',
        severity: data.stats.unhealthy >= 3 ? 'critical' : 'warning',
        label: `${data.stats.unhealthy} unhealthy project${data.stats.unhealthy > 1 ? 's' : ''}`,
        detail: names,
        timestamp: latest.timestamp,
      });
    }

    // Disk usage > 85%
    for (const p of data.projects) {
      if (p.diskPercent != null && p.diskPercent > 85) {
        anomalies.push({
          source: 'supabase',
          severity: p.diskPercent > 95 ? 'critical' : 'warning',
          label: `${p.name}: disk ${p.diskPercent}% full`,
          detail: p.diskUsedGb != null && p.diskTotalGb != null
            ? `${p.diskUsedGb.toFixed(1)}/${p.diskTotalGb.toFixed(1)} GB`
            : '',
          timestamp: latest.timestamp,
        });
      }
    }

    // High connections
    for (const p of data.projects) {
      if (p.activeConnections != null && p.activeConnections > 80) {
        anomalies.push({
          source: 'supabase',
          severity: 'warning',
          label: `${p.name}: ${p.activeConnections} connections`,
          detail: 'Connection count is high',
          timestamp: latest.timestamp,
        });
      }
    }

    return anomalies;
  },
};

/** Reset round-robin and force full enrichment on next fetchSnapshot (used by force-refresh) */
export function resetForFullRefresh(): void {
  _pollCycle = 4; // next increment makes it 5, triggering advisor fetch (_pollCycle % 5 === 0)
  _projectRotation = 0;
  _forceFullRefresh = true; // bypass round-robin on next poll
}

export async function initAdapter(): Promise<void> {
  const token = await getToken('supabase');
  _cachedToken = token || null;
}

export async function setSupabaseToken(token: string): Promise<void> {
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
