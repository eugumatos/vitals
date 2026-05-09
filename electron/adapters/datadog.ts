import { getToken, setToken } from '../store';
import type { Adapter, Snapshot, Anomaly } from './types';

const API_BASE = 'https://api.datadoghq.com/api';

export interface DatadogSnapshot {
  monitors: Array<{
    id: number;
    name: string;
    type: string;
    status: 'OK' | 'Alert' | 'Warn' | 'No Data' | 'Unknown';
    message: string;
    tags: string[];
    lastTriggered: string | null;
  }>;
  events: Array<{
    id: number;
    title: string;
    text: string;
    source: string;
    priority: 'normal' | 'low';
    alertType: 'error' | 'warning' | 'info' | 'success';
    timestamp: number;
  }>;
  stats: {
    totalMonitors: number;
    alerting: number;
    warning: number;
    ok: number;
    noData: number;
  };
}

let _cachedApiKey: string | null = null;
let _cachedAppKey: string | null = null;
let snapshotHistory: Snapshot[] = [];

async function datadogFetch<T>(endpoint: string, apiKey: string, appKey: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'DD-API-KEY': apiKey,
      'DD-APPLICATION-KEY': appKey,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Datadog API ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

function parseKeys(token: string): { apiKey: string; appKey: string } {
  // Token format: "apiKey:appKey"
  const sep = token.indexOf(':');
  if (sep === -1) throw new Error('Invalid Datadog token format. Use "API_KEY:APP_KEY"');
  return { apiKey: token.slice(0, sep), appKey: token.slice(sep + 1) };
}

async function fetchMonitors(apiKey: string, appKey: string): Promise<DatadogSnapshot['monitors']> {
  const monitors = await datadogFetch<any[]>(
    '/v1/monitor?page=0&page_size=30&sort=status,asc',
    apiKey,
    appKey
  );

  return monitors.map((m) => ({
    id: m.id,
    name: m.name,
    type: m.type,
    status: mapStatus(m.overall_state),
    message: m.message || '',
    tags: m.tags || [],
    lastTriggered: m.state?.groups
      ? Object.values(m.state.groups as Record<string, any>)
          .map((g: any) => g.last_triggered_ts)
          .filter(Boolean)
          .sort()
          .pop()
        ? new Date(
            Math.max(
              ...Object.values(m.state.groups as Record<string, any>)
                .map((g: any) => g.last_triggered_ts)
                .filter(Boolean)
                .map(Number)
            ) * 1000
          ).toISOString()
        : null
      : null,
  }));
}

function mapStatus(state: string): DatadogSnapshot['monitors'][0]['status'] {
  switch (state) {
    case 'Alert': return 'Alert';
    case 'Warn': return 'Warn';
    case 'OK': return 'OK';
    case 'No Data': return 'No Data';
    default: return 'Unknown';
  }
}

async function fetchEvents(apiKey: string, appKey: string): Promise<DatadogSnapshot['events']> {
  const now = Math.floor(Date.now() / 1000);
  const hourAgo = now - 3600;

  try {
    const data = await datadogFetch<any>(
      `/v1/events?start=${hourAgo}&end=${now}&priority=normal&unaggregated=true`,
      apiKey,
      appKey
    );

    return (data.events || []).slice(0, 20).map((e: any) => ({
      id: e.id,
      title: e.title,
      text: (e.text || '').slice(0, 200),
      source: e.source || '',
      priority: e.priority || 'normal',
      alertType: e.alert_type || 'info',
      timestamp: e.date_happened,
    }));
  } catch {
    return [];
  }
}

export const datadogAdapter: Adapter = {
  name: 'datadog',

  isConfigured(): boolean {
    return _cachedApiKey !== null && _cachedAppKey !== null;
  },

  async fetchSnapshot(): Promise<Snapshot> {
    const token = await getToken('datadog');
    if (!token) throw new Error('Datadog not configured');
    const { apiKey, appKey } = parseKeys(token);
    _cachedApiKey = apiKey;
    _cachedAppKey = appKey;

    const [monitors, events] = await Promise.all([
      fetchMonitors(apiKey, appKey),
      fetchEvents(apiKey, appKey),
    ]);

    const stats = {
      totalMonitors: monitors.length,
      alerting: monitors.filter((m) => m.status === 'Alert').length,
      warning: monitors.filter((m) => m.status === 'Warn').length,
      ok: monitors.filter((m) => m.status === 'OK').length,
      noData: monitors.filter((m) => m.status === 'No Data').length,
    };

    const snapshot: Snapshot = {
      source: 'datadog',
      timestamp: Date.now(),
      data: { monitors, events, stats } as unknown as Record<string, any>,
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

    const data = latest.data as unknown as DatadogSnapshot;

    // Multiple monitors alerting
    if (data.stats.alerting >= 2) {
      anomalies.push({
        source: 'datadog',
        severity: 'warning',
        label: `${data.stats.alerting} monitors alerting`,
        detail: data.monitors
          .filter((m) => m.status === 'Alert')
          .slice(0, 3)
          .map((m) => m.name)
          .join(', '),
        timestamp: latest.timestamp,
      });
    }

    // Critical: many monitors alerting
    if (data.stats.alerting >= 5) {
      anomalies.push({
        source: 'datadog',
        severity: 'critical',
        label: `${data.stats.alerting} monitors in alert state`,
        detail: `${data.stats.warning} warnings, ${data.stats.noData} with no data`,
        timestamp: latest.timestamp,
      });
    }

    // Error events spike
    const errorEvents = data.events.filter((e) => e.alertType === 'error');
    if (errorEvents.length >= 5) {
      anomalies.push({
        source: 'datadog',
        severity: 'warning',
        label: `${errorEvents.length} error events in last hour`,
        detail: errorEvents.slice(0, 3).map((e) => e.title).join(', '),
        timestamp: latest.timestamp,
      });
    }

    return anomalies;
  },
};

export async function initAdapter(): Promise<void> {
  const token = await getToken('datadog');
  if (token) {
    try {
      const { apiKey, appKey } = parseKeys(token);
      _cachedApiKey = apiKey;
      _cachedAppKey = appKey;
    } catch {
      _cachedApiKey = null;
      _cachedAppKey = null;
    }
  }
}

export async function setDatadogToken(token: string): Promise<void> {
  const { apiKey, appKey } = parseKeys(token);
  await setToken('datadog', token);
  _cachedApiKey = apiKey;
  _cachedAppKey = appKey;
}

export async function disconnectDatadog(): Promise<void> {
  const { removeToken } = await import('../store');
  await removeToken('datadog');
  _cachedApiKey = null;
  _cachedAppKey = null;
}

export function getSnapshotHistory(): Snapshot[] {
  return snapshotHistory;
}
