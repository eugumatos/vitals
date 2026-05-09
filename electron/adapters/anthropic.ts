import { getToken, setToken } from '../store';
import type { Adapter, Snapshot, Anomaly } from './types';

const API_BASE = 'https://api.anthropic.com/v1';

export interface ClaudeCodeMetrics {
  date: string;
  actor: { type: string; email_address?: string; api_key_name?: string };
  customerType: string;
  terminalType: string;
  sessions: number;
  linesAdded: number;
  linesRemoved: number;
  commits: number;
  pullRequests: number;
  tools: {
    edit: { accepted: number; rejected: number };
    write: { accepted: number; rejected: number };
    notebookEdit: { accepted: number; rejected: number };
  };
  models: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    estimatedCostCents: number;
  }>;
}

export interface AnthropicSnapshot {
  daily: ClaudeCodeMetrics[];
  totals: {
    sessions: number;
    linesAdded: number;
    linesRemoved: number;
    commits: number;
    pullRequests: number;
    totalCostCents: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    editAcceptRate: number | null;
    models: Array<{
      model: string;
      inputTokens: number;
      outputTokens: number;
      estimatedCostCents: number;
    }>;
  };
  periodStart: string;
  periodEnd: string;
}

let _cachedToken: string | null = null;
let snapshotHistory: Snapshot[] = [];

async function adminFetch<T>(endpoint: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'x-api-key': token,
      'anthropic-version': '2023-06-01',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status}: ${res.statusText} ${body}`);
  }

  return res.json() as Promise<T>;
}

interface ClaudeCodeResponse {
  data: Array<{
    date: string;
    actor: { type: string; email_address?: string; api_key_name?: string };
    organization_id: string;
    customer_type: string;
    terminal_type: string;
    core_metrics: {
      num_sessions: number;
      lines_of_code: { added: number; removed: number };
      commits_by_claude_code: number;
      pull_requests_by_claude_code: number;
    };
    tool_actions: {
      edit_tool?: { accepted: number; rejected: number };
      multi_edit_tool?: { accepted: number; rejected: number };
      write_tool?: { accepted: number; rejected: number };
      notebook_edit_tool?: { accepted: number; rejected: number };
    };
    model_breakdown: Array<{
      model: string;
      tokens: {
        input: number;
        output: number;
        cache_read: number;
        cache_creation: number;
      };
      estimated_cost: {
        currency: string;
        amount: number;
      };
    }>;
  }>;
  has_more: boolean;
  next_page: string | null;
}

async function fetchClaudeCodeAnalytics(token: string): Promise<AnthropicSnapshot> {
  const now = new Date();
  // Fetch last 7 days
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const allMetrics: ClaudeCodeMetrics[] = [];

  // Fetch each day (API returns one day at a time)
  for (let d = new Date(weekAgo); d <= now; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];

    let hasMore = true;
    let page: string | null = null;

    while (hasMore) {
      const pageParam: string = page ? `&page=${encodeURIComponent(page)}` : '';
      const data: ClaudeCodeResponse = await adminFetch<ClaudeCodeResponse>(
        `/organizations/usage_report/claude_code?starting_at=${dateStr}&limit=100${pageParam}`,
        token
      );

      for (const record of data.data) {
        const editTool = record.tool_actions.edit_tool || { accepted: 0, rejected: 0 };
        const multiEditTool = record.tool_actions.multi_edit_tool || { accepted: 0, rejected: 0 };
        const writeTool = record.tool_actions.write_tool || { accepted: 0, rejected: 0 };
        const notebookEditTool = record.tool_actions.notebook_edit_tool || { accepted: 0, rejected: 0 };

        allMetrics.push({
          date: record.date,
          actor: record.actor,
          customerType: record.customer_type,
          terminalType: record.terminal_type,
          sessions: record.core_metrics.num_sessions,
          linesAdded: record.core_metrics.lines_of_code.added,
          linesRemoved: record.core_metrics.lines_of_code.removed,
          commits: record.core_metrics.commits_by_claude_code,
          pullRequests: record.core_metrics.pull_requests_by_claude_code,
          tools: {
            edit: { accepted: editTool.accepted + multiEditTool.accepted, rejected: editTool.rejected + multiEditTool.rejected },
            write: writeTool,
            notebookEdit: notebookEditTool,
          },
          models: record.model_breakdown.map((m) => ({
            model: m.model,
            inputTokens: m.tokens.input,
            outputTokens: m.tokens.output,
            cacheReadTokens: m.tokens.cache_read,
            cacheCreationTokens: m.tokens.cache_creation,
            estimatedCostCents: m.estimated_cost.amount,
          })),
        });
      }

      hasMore = data.has_more;
      page = data.next_page;
      if (!page) hasMore = false;
    }
  }

  // Aggregate totals
  let sessions = 0;
  let linesAdded = 0;
  let linesRemoved = 0;
  let commits = 0;
  let pullRequests = 0;
  let totalCostCents = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalEditAccepted = 0;
  let totalEditRejected = 0;
  const modelAgg: Record<string, { inputTokens: number; outputTokens: number; estimatedCostCents: number }> = {};

  for (const m of allMetrics) {
    sessions += m.sessions;
    linesAdded += m.linesAdded;
    linesRemoved += m.linesRemoved;
    commits += m.commits;
    pullRequests += m.pullRequests;
    totalEditAccepted += m.tools.edit.accepted + m.tools.write.accepted;
    totalEditRejected += m.tools.edit.rejected + m.tools.write.rejected;

    for (const model of m.models) {
      totalCostCents += model.estimatedCostCents;
      totalInput += model.inputTokens;
      totalOutput += model.outputTokens;

      if (!modelAgg[model.model]) {
        modelAgg[model.model] = { inputTokens: 0, outputTokens: 0, estimatedCostCents: 0 };
      }
      modelAgg[model.model].inputTokens += model.inputTokens;
      modelAgg[model.model].outputTokens += model.outputTokens;
      modelAgg[model.model].estimatedCostCents += model.estimatedCostCents;
    }
  }

  const totalActions = totalEditAccepted + totalEditRejected;
  const editAcceptRate = totalActions > 0 ? Math.round((totalEditAccepted / totalActions) * 100) : null;

  return {
    daily: allMetrics,
    totals: {
      sessions,
      linesAdded,
      linesRemoved,
      commits,
      pullRequests,
      totalCostCents,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      editAcceptRate,
      models: Object.entries(modelAgg).map(([model, stats]) => ({ model, ...stats })),
    },
    periodStart: weekAgo.toISOString(),
    periodEnd: now.toISOString(),
  };
}

export const anthropicAdapter: Adapter = {
  name: 'anthropic',

  isConfigured(): boolean {
    return _cachedToken !== null;
  },

  async fetchSnapshot(): Promise<Snapshot> {
    const token = await getToken('anthropic');
    if (!token) throw new Error('Anthropic not configured');
    _cachedToken = token;

    const analytics = await fetchClaudeCodeAnalytics(token);

    const snapshot: Snapshot = {
      source: 'anthropic',
      timestamp: Date.now(),
      data: analytics as unknown as Record<string, any>,
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

    const data = latest.data as unknown as AnthropicSnapshot;

    const costDollars = data.totals.totalCostCents / 100;
    if (costDollars > 50) {
      anomalies.push({
        source: 'anthropic',
        severity: 'warning',
        label: `High Claude Code spend: $${costDollars.toFixed(2)} in 7d`,
        detail: `${data.totals.sessions} sessions, ${formatNumber(data.totals.linesAdded)} lines added`,
        timestamp: latest.timestamp,
      });
    }

    if (data.totals.editAcceptRate !== null && data.totals.editAcceptRate < 50) {
      anomalies.push({
        source: 'anthropic',
        severity: 'warning',
        label: `Low tool accept rate: ${data.totals.editAcceptRate}%`,
        detail: 'Consider adjusting prompts or workflow',
        timestamp: latest.timestamp,
      });
    }

    return anomalies;
  },
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export async function initAdapter(): Promise<void> {
  const token = await getToken('anthropic');
  _cachedToken = token || null;
}

export async function setAnthropicToken(token: string): Promise<void> {
  await setToken('anthropic', token);
  _cachedToken = token;
}

export async function disconnectAnthropic(): Promise<void> {
  const { removeToken } = await import('../store');
  await removeToken('anthropic');
  _cachedToken = null;
}

export function getSnapshotHistory(): Snapshot[] {
  return snapshotHistory;
}
