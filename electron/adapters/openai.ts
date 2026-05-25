import { getToken, setToken } from '../store';
import type { Adapter, Snapshot, Anomaly } from './types';

const API_BASE = 'https://api.openai.com/v1';

export interface OpenAIUsageBucket {
  startTime: number;
  endTime: number;
  inputTokens: number;
  outputTokens: number;
  numRequests: number;
  inputCachedTokens: number;
  model: string;
}

export interface OpenAISnapshot {
  usage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalRequests: number;
    totalCost: number;
    byModel: Array<{
      model: string;
      inputTokens: number;
      outputTokens: number;
      requests: number;
    }>;
  };
  periodStart: string;
  periodEnd: string;
}

let _cachedToken: string | null = null;
let snapshotHistory: Snapshot[] = [];

async function openAIFetch<T>(endpoint: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`OpenAI API ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

// Rough cost estimation per 1M tokens (USD)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4': { input: 30, output: 60 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'o1': { input: 15, output: 60 },
  'o1-mini': { input: 3, output: 12 },
  'o3-mini': { input: 1.1, output: 4.4 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const key = Object.keys(MODEL_COSTS).find((k) => model.startsWith(k)) || '';
  const rates = MODEL_COSTS[key] || { input: 5, output: 15 }; // fallback
  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
}

async function fetchUsage(token: string): Promise<OpenAISnapshot> {
  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 24 * 60 * 60;

  const data = await openAIFetch<any>(
    `/organization/usage/completions?start_time=${dayAgo}&end_time=${now}&bucket_width=1d&group_by=model&limit=20`,
    token
  );

  const byModel: Record<string, { inputTokens: number; outputTokens: number; requests: number }> = {};
  let totalInput = 0;
  let totalOutput = 0;
  let totalRequests = 0;

  for (const bucket of data.data || []) {
    for (const result of bucket.results || []) {
      const model = result.model || 'unknown';
      const inp = result.input_tokens || 0;
      const out = result.output_tokens || 0;
      const reqs = result.num_model_requests || 0;

      totalInput += inp;
      totalOutput += out;
      totalRequests += reqs;

      if (!byModel[model]) byModel[model] = { inputTokens: 0, outputTokens: 0, requests: 0 };
      byModel[model].inputTokens += inp;
      byModel[model].outputTokens += out;
      byModel[model].requests += reqs;
    }
  }

  let totalCost = 0;
  const byModelArr = Object.entries(byModel).map(([model, stats]) => {
    totalCost += estimateCost(model, stats.inputTokens, stats.outputTokens);
    return { model, ...stats };
  });

  return {
    usage: {
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalRequests,
      totalCost: Math.round(totalCost * 100) / 100,
      byModel: byModelArr,
    },
    periodStart: new Date(dayAgo * 1000).toISOString(),
    periodEnd: new Date(now * 1000).toISOString(),
  };
}

export const openaiAdapter: Adapter = {
  name: 'openai',

  isConfigured(): boolean {
    return _cachedToken !== null;
  },

  async fetchSnapshot(): Promise<Snapshot> {
    const token = await getToken('openai');
    if (!token) throw new Error('OpenAI not configured');
    _cachedToken = token;

    const usage = await fetchUsage(token);

    const snapshot: Snapshot = {
      source: 'openai',
      timestamp: Date.now(),
      data: usage as unknown as Record<string, any>,
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

    const data = latest.data as unknown as OpenAISnapshot;

    // High cost alert (>$10 in 24h)
    if (data.usage.totalCost > 10) {
      anomalies.push({
        source: 'openai',
        severity: 'warning',
        label: `High OpenAI spend: $${data.usage.totalCost.toFixed(2)} in 24h`,
        detail: `${data.usage.totalRequests} requests, ${formatTokens(data.usage.totalInputTokens + data.usage.totalOutputTokens)} tokens`,
        timestamp: latest.timestamp,
      });
    }

    // Very high cost (>$50 in 24h)
    if (data.usage.totalCost > 50) {
      anomalies.push({
        source: 'openai',
        severity: 'critical',
        label: `Critical OpenAI spend: $${data.usage.totalCost.toFixed(2)} in 24h`,
        detail: `${data.usage.totalRequests} requests across ${data.usage.byModel.length} models`,
        timestamp: latest.timestamp,
      });
    }

    return anomalies;
  },
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export async function initAdapter(): Promise<void> {
  const token = await getToken('openai');
  _cachedToken = token || null;
}

export async function setOpenAIToken(token: string): Promise<void> {
  await setToken('openai', token);
  _cachedToken = token;
}

export async function disconnectOpenAI(): Promise<void> {
  const { removeToken } = await import('../store');
  await removeToken('openai');
  _cachedToken = null;
}

export function getSnapshotHistory(): Snapshot[] {
  return snapshotHistory;
}
