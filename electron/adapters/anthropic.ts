import { readdir, readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { getToken, setToken, getAnthropicLocal, setAnthropicLocal, clearAnthropicLocal } from '../store';
import type { Adapter, Snapshot, Anomaly } from './types';

const API_BASE = 'https://api.anthropic.com/v1';
const CLAUDE_DIR = join(homedir(), '.claude');
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');
const HISTORY_FILE = join(CLAUDE_DIR, 'history.jsonl');

// Cost per million tokens (USD) — used for local mode estimation
const MODEL_COSTS: Record<string, { input: number; output: number; cacheRead: number; cacheCreation: number }> = {
  'claude-opus-4': { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
  'claude-sonnet-4': { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
  'claude-haiku-4': { input: 0.8, output: 4, cacheRead: 0.08, cacheCreation: 1 },
  'claude-3-5-sonnet': { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
  'claude-3-5-haiku': { input: 0.8, output: 4, cacheRead: 0.08, cacheCreation: 1 },
};

function estimateCost(model: string, input: number, output: number, cacheRead: number, cacheCreation: number): number {
  const key = Object.keys(MODEL_COSTS).find((k) => model.startsWith(k)) || '';
  const rates = MODEL_COSTS[key] || { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 };
  return (
    (input / 1_000_000) * rates.input +
    (output / 1_000_000) * rates.output +
    (cacheRead / 1_000_000) * rates.cacheRead +
    (cacheCreation / 1_000_000) * rates.cacheCreation
  );
}

// ─── Shared types ───

export interface LocalSession {
  sessionId: string;
  project: string;
  startedAt: string;
  models: Record<string, { input: number; output: number; cacheRead: number; cacheCreation: number; messages: number }>;
  toolUses: { edit: number; write: number; bash: number };
}

export interface AnthropicSnapshot {
  mode: 'local' | 'admin';
  daily: any[];
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
      cacheReadTokens: number;
      cacheCreationTokens: number;
      estimatedCostCents: number;
      messages: number;
    }>;
    byPlan: Array<{
      customerType: string;
      sessions: number;
      linesAdded: number;
      linesRemoved: number;
      commits: number;
      totalCostCents: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      users: number;
    }>;
    // Local mode extras
    recentSessions: Array<{
      sessionId: string;
      project: string;
      startedAt: string;
      messages: number;
      tokens: number;
      costCents: number;
    }>;
  };
  periodStart: string;
  periodEnd: string;
}

let _cachedToken: string | null = null;
let _localMode = false;
let _localPlan: string = 'max';
let snapshotHistory: Snapshot[] = [];

// ─── Session file cache ───

type ParsedSession = {
  sessionId: string;
  models: Record<string, { input: number; output: number; cacheRead: number; cacheCreation: number; messages: number }>;
  toolUses: { edit: number; write: number; bash: number };
  messageCount: number;
};

const SESSION_CACHE_MAX = 50;
const sessionCache = new Map<string, { mtime: number; data: ParsedSession }>();

// ─── Local mode: read ~/.claude/ session files ───

async function fileExists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

export async function isClaudeCodeInstalled(): Promise<boolean> {
  return fileExists(CLAUDE_DIR);
}

async function findSessionFiles(daysBack: number): Promise<Array<{ path: string; mtime: number }>> {
  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const files: Array<{ path: string; mtime: number }> = [];

  try {
    const projectDirs = await readdir(PROJECTS_DIR);
    for (const dir of projectDirs) {
      const dirPath = join(PROJECTS_DIR, dir);
      const dirStat = await stat(dirPath).catch(() => null);
      if (!dirStat?.isDirectory()) continue;

      const entries = await readdir(dirPath).catch(() => []);
      for (const entry of entries) {
        if (!entry.endsWith('.jsonl')) continue;
        const filePath = join(dirPath, entry);
        const fileStat = await stat(filePath).catch(() => null);
        if (fileStat && fileStat.mtimeMs > cutoff) {
          files.push({ path: filePath, mtime: fileStat.mtimeMs });
        }
      }
    }
  } catch { /* ~/.claude/projects may not exist */ }

  return files;
}

interface SessionMeta { sessionId: string; project: string; timestamp: number }

async function getSessionMeta(): Promise<Map<string, SessionMeta>> {
  const map = new Map<string, SessionMeta>();
  try {
    const content = await readFile(HISTORY_FILE, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const sid = entry.sessionId;
        if (sid && !map.has(sid)) {
          map.set(sid, {
            sessionId: sid,
            project: entry.project || '',
            timestamp: entry.timestamp || 0,
          });
        }
      } catch { /* skip malformed lines */ }
    }
  } catch { /* history.jsonl may not exist */ }
  return map;
}

async function parseSessionFile(filePath: string, lastMtime?: number): Promise<ParsedSession | null> {
  if (lastMtime !== undefined) {
    const fileStat = await stat(filePath).catch(() => null);
    if (fileStat && fileStat.mtimeMs === lastMtime) return null;
  }

  const models: Record<string, { input: number; output: number; cacheRead: number; cacheCreation: number; messages: number }> = {};
  const toolUses = { edit: 0, write: 0, bash: 0 };
  let sessionId = '';
  let messageCount = 0;

  const content = await readFile(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (!sessionId && msg.sessionId) sessionId = msg.sessionId;

      if (msg.type === 'assistant' && msg.message?.usage) {
        const usage = msg.message.usage;
        const model = msg.message.model || 'unknown';
        if (!usage.output_tokens) continue;

        if (!models[model]) {
          models[model] = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, messages: 0 };
        }
        models[model].input += usage.input_tokens || 0;
        models[model].output += usage.output_tokens || 0;
        models[model].cacheRead += usage.cache_read_input_tokens || 0;
        models[model].cacheCreation += usage.cache_creation_input_tokens || 0;
        models[model].messages += 1;
        messageCount += 1;
      }

      // Count tool uses
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_use') {
            const name = block.name?.toLowerCase() || '';
            if (name === 'edit' || name === 'multiedit') toolUses.edit++;
            else if (name === 'write') toolUses.write++;
            else if (name === 'bash') toolUses.bash++;
          }
        }
      }
    } catch { /* skip malformed lines */ }
  }

  return { sessionId, models, toolUses, messageCount };
}

async function fetchLocalAnalytics(): Promise<AnthropicSnapshot> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const sessionFiles = await findSessionFiles(7);
  const metaMap = await getSessionMeta();

  const modelAgg: Record<string, { input: number; output: number; cacheRead: number; cacheCreation: number; messages: number }> = {};
  let totalSessions = 0;
  let totalToolEdits = 0;
  let totalToolWrites = 0;
  let totalToolBash = 0;
  const recentSessions: AnthropicSnapshot['totals']['recentSessions'] = [];

  for (const { path: file, mtime } of sessionFiles) {
    try {
      let parsed: ParsedSession;
      const cached = sessionCache.get(file);
      if (cached && cached.mtime === mtime) {
        parsed = cached.data;
      } else {
        const result = await parseSessionFile(file);
        if (result === null) continue;
        parsed = result;
        if (sessionCache.size >= SESSION_CACHE_MAX) {
          const oldestKey = sessionCache.keys().next().value;
          if (oldestKey !== undefined) sessionCache.delete(oldestKey);
        }
        sessionCache.set(file, { mtime, data: parsed });
      }
      if (parsed.messageCount === 0) continue;

      totalSessions++;
      totalToolEdits += parsed.toolUses.edit;
      totalToolWrites += parsed.toolUses.write;
      totalToolBash += parsed.toolUses.bash;

      let sessionTokens = 0;
      let sessionCostCents = 0;

      for (const [model, stats] of Object.entries(parsed.models)) {
        if (!modelAgg[model]) {
          modelAgg[model] = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, messages: 0 };
        }
        modelAgg[model].input += stats.input;
        modelAgg[model].output += stats.output;
        modelAgg[model].cacheRead += stats.cacheRead;
        modelAgg[model].cacheCreation += stats.cacheCreation;
        modelAgg[model].messages += stats.messages;

        const tokens = stats.input + stats.output + stats.cacheRead + stats.cacheCreation;
        sessionTokens += tokens;
        sessionCostCents += estimateCost(model, stats.input, stats.output, stats.cacheRead, stats.cacheCreation) * 100;
      }

      const meta = metaMap.get(parsed.sessionId);
      recentSessions.push({
        sessionId: parsed.sessionId || file.split('/').pop()?.replace('.jsonl', '') || '',
        project: meta?.project?.split('/').pop() || '',
        startedAt: meta ? new Date(meta.timestamp).toISOString() : '',
        messages: parsed.messageCount,
        tokens: sessionTokens,
        costCents: Math.round(sessionCostCents),
      });
    } catch { /* skip files that fail to parse */ }
  }

  // Sort recent sessions by date (newest first)
  recentSessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  let totalInput = 0;
  let totalOutput = 0;
  let totalCostCents = 0;

  const modelsArr = Object.entries(modelAgg).map(([model, stats]) => {
    totalInput += stats.input + stats.cacheRead + stats.cacheCreation;
    totalOutput += stats.output;
    const cost = estimateCost(model, stats.input, stats.output, stats.cacheRead, stats.cacheCreation) * 100;
    totalCostCents += cost;
    return {
      model,
      inputTokens: stats.input + stats.cacheRead + stats.cacheCreation,
      outputTokens: stats.output,
      cacheReadTokens: stats.cacheRead,
      cacheCreationTokens: stats.cacheCreation,
      estimatedCostCents: Math.round(cost),
      messages: stats.messages,
    };
  }).sort((a, b) => b.estimatedCostCents - a.estimatedCostCents);

  return {
    mode: 'local',
    daily: [],
    totals: {
      sessions: totalSessions,
      linesAdded: 0,   // not available from local data
      linesRemoved: 0,
      commits: 0,
      pullRequests: 0,
      totalCostCents: Math.round(totalCostCents),
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      editAcceptRate: null,
      models: modelsArr,
      byPlan: [{
        customerType: _localPlan,
        sessions: totalSessions,
        linesAdded: 0,
        linesRemoved: 0,
        commits: 0,
        totalCostCents: Math.round(totalCostCents),
        totalInputTokens: totalInput,
        totalOutputTokens: totalOutput,
        users: 1,
      }],
      recentSessions: recentSessions.slice(0, 20),
    },
    periodStart: weekAgo.toISOString(),
    periodEnd: now.toISOString(),
  };
}

// ─── Admin key mode (original) ───

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
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const allRecords: ClaudeCodeResponse['data'] = [];

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
      allRecords.push(...data.data);
      hasMore = data.has_more;
      page = data.next_page;
      if (!page) hasMore = false;
    }
  }

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
  const planAgg: Record<string, { sessions: number; linesAdded: number; linesRemoved: number; commits: number; totalCostCents: number; totalInputTokens: number; totalOutputTokens: number; users: Set<string> }> = {};

  for (const record of allRecords) {
    const editTool = record.tool_actions.edit_tool || { accepted: 0, rejected: 0 };
    const multiEditTool = record.tool_actions.multi_edit_tool || { accepted: 0, rejected: 0 };
    const writeTool = record.tool_actions.write_tool || { accepted: 0, rejected: 0 };

    sessions += record.core_metrics.num_sessions;
    linesAdded += record.core_metrics.lines_of_code.added;
    linesRemoved += record.core_metrics.lines_of_code.removed;
    commits += record.core_metrics.commits_by_claude_code;
    pullRequests += record.core_metrics.pull_requests_by_claude_code;
    totalEditAccepted += editTool.accepted + multiEditTool.accepted + writeTool.accepted;
    totalEditRejected += editTool.rejected + multiEditTool.rejected + writeTool.rejected;

    const plan = record.customer_type || 'unknown';
    if (!planAgg[plan]) {
      planAgg[plan] = { sessions: 0, linesAdded: 0, linesRemoved: 0, commits: 0, totalCostCents: 0, totalInputTokens: 0, totalOutputTokens: 0, users: new Set() };
    }
    planAgg[plan].sessions += record.core_metrics.num_sessions;
    planAgg[plan].linesAdded += record.core_metrics.lines_of_code.added;
    planAgg[plan].linesRemoved += record.core_metrics.lines_of_code.removed;
    planAgg[plan].commits += record.core_metrics.commits_by_claude_code;
    planAgg[plan].users.add(record.actor.email_address || record.actor.api_key_name || 'unknown');

    for (const m of record.model_breakdown) {
      const cost = m.estimated_cost.amount;
      totalCostCents += cost;
      totalInput += m.tokens.input;
      totalOutput += m.tokens.output;

      planAgg[plan].totalCostCents += cost;
      planAgg[plan].totalInputTokens += m.tokens.input;
      planAgg[plan].totalOutputTokens += m.tokens.output;

      if (!modelAgg[m.model]) modelAgg[m.model] = { inputTokens: 0, outputTokens: 0, estimatedCostCents: 0 };
      modelAgg[m.model].inputTokens += m.tokens.input;
      modelAgg[m.model].outputTokens += m.tokens.output;
      modelAgg[m.model].estimatedCostCents += cost;
    }
  }

  const totalActions = totalEditAccepted + totalEditRejected;

  return {
    mode: 'admin',
    daily: [],
    totals: {
      sessions,
      linesAdded,
      linesRemoved,
      commits,
      pullRequests,
      totalCostCents,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      editAcceptRate: totalActions > 0 ? Math.round((totalEditAccepted / totalActions) * 100) : null,
      models: Object.entries(modelAgg).map(([model, s]) => ({
        model,
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        estimatedCostCents: s.estimatedCostCents,
        messages: 0,
      })),
      byPlan: Object.entries(planAgg)
        .map(([customerType, s]) => ({
          customerType,
          sessions: s.sessions,
          linesAdded: s.linesAdded,
          linesRemoved: s.linesRemoved,
          commits: s.commits,
          totalCostCents: s.totalCostCents,
          totalInputTokens: s.totalInputTokens,
          totalOutputTokens: s.totalOutputTokens,
          users: s.users.size,
        }))
        .sort((a, b) => b.totalCostCents - a.totalCostCents),
      recentSessions: [],
    },
    periodStart: weekAgo.toISOString(),
    periodEnd: now.toISOString(),
  };
}

// ─── Adapter ───

export const anthropicAdapter: Adapter = {
  name: 'anthropic',

  isConfigured(): boolean {
    return _localMode || _cachedToken !== null;
  },

  async fetchSnapshot(): Promise<Snapshot> {
    let analytics: AnthropicSnapshot;

    if (_localMode) {
      analytics = await fetchLocalAnalytics();
    } else {
      const token = await getToken('anthropic');
      if (!token) throw new Error('Anthropic not configured');
      _cachedToken = token;
      analytics = await fetchClaudeCodeAnalytics(token);
    }

    const snapshot: Snapshot = {
      source: 'anthropic',
      timestamp: Date.now(),
      data: analytics as unknown as Record<string, any>,
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

    const data = latest.data as unknown as AnthropicSnapshot;
    const costDollars = data.totals.totalCostCents / 100;

    if (costDollars > 50) {
      anomalies.push({
        source: 'anthropic',
        severity: 'warning',
        label: `High Claude Code spend: $${costDollars.toFixed(2)} in 7d`,
        detail: `${data.totals.sessions} sessions`,
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
  if (token) {
    _cachedToken = token;
    _localMode = false;
    return;
  }

  // Restore saved local mode
  const saved = await getAnthropicLocal();
  if (saved?.enabled) {
    const installed = await isClaudeCodeInstalled();
    if (installed) {
      _localMode = true;
      _localPlan = saved.plan || 'max';
      console.log('[vitals] Anthropic: local mode restored (plan: %s)', _localPlan);
    }
  }
}

export async function enableLocalMode(plan?: string): Promise<boolean> {
  const installed = await isClaudeCodeInstalled();
  if (installed) {
    _localMode = true;
    _localPlan = plan || 'max';
    _cachedToken = null;
    await setAnthropicLocal(_localPlan);
    return true;
  }
  return false;
}

export async function setAnthropicToken(token: string): Promise<void> {
  await setToken('anthropic', token);
  _cachedToken = token;
  _localMode = false;
}

export async function disconnectAnthropic(): Promise<void> {
  const { removeToken } = await import('../store');
  await removeToken('anthropic');
  await clearAnthropicLocal();
  _cachedToken = null;
  _localMode = false;
}

export function getSnapshotHistory(): Snapshot[] {
  return snapshotHistory;
}

export function isLocalMode(): boolean {
  return _localMode;
}
