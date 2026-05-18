import { shell } from 'electron';
import { getToken, setToken, getGitHubOAuthConfig, setGitHubOAuthConfig, getWatchedRepos, MAX_WATCHED_REPOS } from '../store';
import type { WatchedRepo } from '../store';
import type { Adapter, Snapshot, Anomaly } from './types';

const API_BASE = 'https://api.github.com';
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const DEVICE_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const SCOPES = 'repo,read:org,notifications';

// Time windows — only show data within these horizons
const ACTIONS_MAX_AGE_MS = 24 * 60 * 60 * 1000;       // 24h
const NOTIFICATIONS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isWithin(dateStr: string, maxAgeMs: number): boolean {
  return Date.now() - new Date(dateStr).getTime() <= maxAgeMs;
}

interface GitHubWorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  head_sha: string;
  head_branch: string;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface GitHubSnapshot {
  prs: {
    total: number;
    needsReview: number;
    approved: number;
    drafts: number;
    items: Array<{
      number: number;
      title: string;
      author: string;
      isAuthor: boolean;
      isReviewRequested: boolean;
      status: 'needs_review' | 'approved' | 'changes_requested' | 'draft';
      branch: string;
      baseBranch: string;
      repo: string;
      repoFullName: string;
      updatedAt: string;
    }>;
  };
  actions: {
    recentRuns: Array<{
      name: string;
      status: string;
      conclusion: string | null;
      sha: string;
      fullSha: string;
      branch: string;
      repo: string;
      updatedAt: string;
    }>;
    failingCount: number;
  };
  notifications: {
    unreadCount: number;
    items: Array<{
      id: string;
      title: string;
      reason: string;
      type: string;
      repo: string;
      repoFullName: string;
      url: string;
      unread: boolean;
      updatedAt: string;
    }>;
  };
}

let pollingInterval: ReturnType<typeof setTimeout> | null = null;
let currentPollMs = 30_000;
let consecutiveErrors = 0;
let snapshotHistory: Snapshot[] = [];
let _cachedLogin: string | null = null;

async function getAuthenticatedLogin(token: string): Promise<string> {
  if (_cachedLogin) return _cachedLogin;
  const user = await githubFetch<{ login: string }>('/user', token);
  _cachedLogin = user.login;
  return _cachedLogin;
}

async function githubFetch<T>(endpoint: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

// --- Public listing APIs ---

export async function listUserRepos(): Promise<Array<{ fullName: string; defaultBranch: string }>> {
  const token = await getToken('github');
  if (!token) throw new Error('GitHub not configured');

  const repos = await githubFetch<any[]>(
    '/user/repos?sort=pushed&per_page=30&type=all',
    token
  );

  return repos.map((r: any) => ({
    fullName: r.full_name,
    defaultBranch: r.default_branch,
  }));
}

export async function listRepoBranches(repoFullName: string): Promise<string[]> {
  const token = await getToken('github');
  if (!token) throw new Error('GitHub not configured');

  const branches = await githubFetch<any[]>(
    `/repos/${repoFullName}/branches?per_page=30`,
    token
  );

  return branches.map((b: any) => b.name);
}

// --- Data fetching (scoped to watched repos) ---

async function getTargetRepos(token: string): Promise<WatchedRepo[]> {
  const watched = await getWatchedRepos();
  if (watched.length > 0) {
    console.log('[vitals] Using watched repos:', watched.map(r => r.fullName).join(', '));
    return watched;
  }

  // Fallback: top N recently pushed repos (any type — includes org repos)
  const repos = await githubFetch<any[]>(
    `/user/repos?sort=pushed&per_page=${MAX_WATCHED_REPOS}&type=all`,
    token
  );
  console.log('[vitals] No watched repos, falling back to:', repos.map((r: any) => r.full_name).join(', '));
  return repos.map((r: any) => ({
    fullName: r.full_name,
    branches: [r.default_branch],
  }));
}

async function fetchPRs(token: string, targets: WatchedRepo[], login: string): Promise<GitHubSnapshot['prs']> {
  const allPrs: any[] = [];

  for (const target of targets) {
    try {
      const repoPrs = await githubFetch<any[]>(
        `/repos/${target.fullName}/pulls?state=open&per_page=15`,
        token
      );
      for (const pr of repoPrs) {
        pr._repoName = target.fullName.split('/')[1];
        pr._repoFullName = target.fullName;
      }
      allPrs.push(...repoPrs);
    } catch {
      // skip repos we can't access
    }
  }

  const items = allPrs.map((pr: any) => {
    const authorLogin = pr.user.login;
    const isAuthor = authorLogin.toLowerCase() === login.toLowerCase();
    const isReviewRequested = (pr.requested_reviewers || []).some(
      (r: any) => r.login.toLowerCase() === login.toLowerCase()
    );
    return {
      number: pr.number,
      title: pr.title,
      author: authorLogin,
      isAuthor,
      isReviewRequested,
      status: pr.draft
        ? ('draft' as const)
        : pr.requested_reviewers?.length > 0
          ? ('needs_review' as const)
          : ('approved' as const),
      branch: pr.head.ref,
      baseBranch: pr.base.ref,
      repo: pr._repoName || '',
      repoFullName: pr._repoFullName || '',
      updatedAt: pr.updated_at,
    };
  });

  // Sort: review requests for me first, then my PRs, then others
  items.sort((a, b) => {
    const scoreA = a.isReviewRequested ? 0 : a.isAuthor ? 1 : 2;
    const scoreB = b.isReviewRequested ? 0 : b.isAuthor ? 1 : 2;
    return scoreA - scoreB;
  });

  return {
    total: allPrs.length,
    needsReview: items.filter((p) => p.status === 'needs_review').length,
    approved: items.filter((p) => p.status === 'approved').length,
    drafts: items.filter((p) => p.status === 'draft').length,
    items,
  };
}

async function fetchActions(token: string, targets: WatchedRepo[]): Promise<GitHubSnapshot['actions']> {
  const allRuns: (GitHubWorkflowRun & { _repoName: string; _repoFullName: string })[] = [];

  for (const target of targets) {
    try {
      // Fetch recent runs for the repo (all branches — more useful overview)
      const result = await githubFetch<{ workflow_runs: GitHubWorkflowRun[] }>(
        `/repos/${target.fullName}/actions/runs?per_page=10`,
        token
      );
      allRuns.push(...result.workflow_runs.map(r => ({
        ...r,
        _repoName: target.fullName.split('/')[1],
        _repoFullName: target.fullName,
      })));
    } catch {
      // skip repos without Actions or that we can't access
    }
  }

  // Only keep runs from the last 24h
  const withinWindow = allRuns.filter((r) => isWithin(r.updated_at, ACTIONS_MAX_AGE_MS));
  withinWindow.sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  const recentRuns = withinWindow.slice(0, 10).map((run) => ({
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    sha: run.head_sha.slice(0, 7),
    fullSha: run.head_sha,
    branch: run.head_branch,
    repo: run._repoName,
    repoFullName: run._repoFullName,
    updatedAt: run.updated_at,
  }));

  return {
    recentRuns,
    failingCount: recentRuns.filter((r) => r.conclusion === 'failure').length,
  };
}

async function fetchNotifications(
  token: string
): Promise<GitHubSnapshot['notifications']> {
  const notifications = await githubFetch<any[]>(
    '/notifications?per_page=30',
    token
  );

  // Only keep notifications from the last 7 days
  const recent = notifications.filter((n: any) => isWithin(n.updated_at || '', NOTIFICATIONS_MAX_AGE_MS));

  const items = recent.map((n: any) => {
    // Build a usable HTML URL from the API URL
    const subjectUrl = n.subject?.url || '';
    let htmlUrl = '';
    if (subjectUrl) {
      // Convert API URL to HTML URL: /repos/owner/repo/pulls/123 -> /owner/repo/pull/123
      htmlUrl = subjectUrl
        .replace('https://api.github.com/repos/', 'https://github.com/')
        .replace('/pulls/', '/pull/')
        .replace('/issues/', '/issues/');
    }

    return {
      id: n.id,
      title: n.subject?.title || '',
      reason: n.reason || 'subscribed',
      type: n.subject?.type || 'Unknown',
      repo: n.repository?.name || '',
      repoFullName: n.repository?.full_name || '',
      url: htmlUrl,
      unread: n.unread,
      updatedAt: n.updated_at || '',
    };
  });

  return {
    unreadCount: items.filter((n) => n.unread).length,
    items: items.slice(0, 15),
  };
}

// --- Device Flow ---

export interface DeviceFlowStatus {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
}

let deviceFlowAbort: (() => void) | null = null;

export async function startDeviceFlow(clientId: string): Promise<DeviceFlowStatus> {
  // Save client ID for future use
  await setGitHubOAuthConfig(clientId, '');

  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      scope: SCOPES,
    }),
  });

  const data = (await res.json()) as any;
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  const { device_code, user_code, verification_uri, expires_in, interval } = data;

  // Open browser for user to enter code
  shell.openExternal(verification_uri);

  // Start polling for token in background
  const cancelRef = { cancelled: false };
  deviceFlowAbort = () => { cancelRef.cancelled = true; };

  pollForToken(clientId, device_code, interval || 5, cancelRef).catch((err) => {
    console.error('Device flow polling error:', err);
  });

  return {
    userCode: user_code,
    verificationUri: verification_uri,
    expiresIn: expires_in,
  };
}

async function pollForToken(
  clientId: string,
  deviceCode: string,
  interval: number,
  cancelRef: { cancelled: boolean }
): Promise<void> {
  const pollMs = interval * 1000;

  while (!cancelRef.cancelled) {
    await new Promise((r) => setTimeout(r, pollMs));
    if (cancelRef.cancelled) return;

    const res = await fetch(DEVICE_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data = (await res.json()) as any;

    if (data.access_token) {
      await setToken('github', data.access_token);
      _cachedToken = data.access_token;
      // Notify renderer
      if (_onDeviceFlowSuccess) _onDeviceFlowSuccess();
      return;
    }

    if (data.error === 'authorization_pending') {
      continue;
    }
    if (data.error === 'slow_down') {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    if (data.error === 'expired_token' || data.error === 'access_denied') {
      throw new Error(data.error_description || data.error);
    }
  }
}

export function cancelDeviceFlow(): void {
  if (deviceFlowAbort) {
    deviceFlowAbort();
    deviceFlowAbort = null;
  }
}

let _onDeviceFlowSuccess: (() => void) | null = null;
export function onDeviceFlowSuccess(cb: () => void): void {
  _onDeviceFlowSuccess = cb;
}

export async function setPersonalToken(token: string): Promise<void> {
  await setToken('github', token);
  _cachedToken = token;
  _cachedLogin = null; // re-fetch on next snapshot
}

// --- Adapter ---

export const githubAdapter: Adapter = {
  name: 'github',

  isConfigured(): boolean {
    return _cachedToken !== null;
  },

  async fetchSnapshot(): Promise<Snapshot> {
    const token = await getToken('github');
    if (!token) throw new Error('GitHub not configured');
    _cachedToken = token;

    const [login, targets] = await Promise.all([
      getAuthenticatedLogin(token),
      getTargetRepos(token),
    ]);

    const [prs, actions, notifications] = await Promise.all([
      fetchPRs(token, targets, login),
      fetchActions(token, targets),
      fetchNotifications(token),
    ]);

    console.log('[vitals] Fetched — PRs:', prs.total, 'Actions:', actions.recentRuns.length, 'Notifications:', notifications.items.length);

    const snapshot: Snapshot = {
      source: 'github',
      timestamp: Date.now(),
      data: { prs, actions, notifications } as unknown as Record<string, any>,
    };

    snapshotHistory.push(snapshot);
    if (snapshotHistory.length > 120) {
      snapshotHistory = snapshotHistory.slice(-120);
    }

    consecutiveErrors = 0;
    return snapshot;
  },

  detectAnomalies(history: Snapshot[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const latest = history[history.length - 1];
    if (!latest) return anomalies;

    const data = latest.data as unknown as GitHubSnapshot;

    if (data.actions.failingCount >= 3) {
      anomalies.push({
        source: 'github',
        severity: 'warning',
        label: `${data.actions.failingCount} CI runs failing`,
        detail: data.actions.recentRuns
          .filter((r) => r.conclusion === 'failure')
          .map((r) => `${r.repo}/${r.name} (${r.sha})`)
          .join(', '),
        timestamp: latest.timestamp,
      });
    }

    return anomalies;
  },
};

// Token cache for sync isConfigured check
let _cachedToken: string | null = null;

export async function initAdapter(): Promise<void> {
  const token = await getToken('github');
  _cachedToken = token || null;
}

// --- Polling ---

export type SnapshotCallback = (snapshot: Snapshot) => void;
export type ErrorCallback = (error: Error) => void;

export function startPolling(
  onSnapshot: SnapshotCallback,
  onError: ErrorCallback,
  intervalMs = 30_000
): void {
  currentPollMs = intervalMs;
  stopPolling();

  async function poll() {
    try {
      const snapshot = await githubAdapter.fetchSnapshot();
      onSnapshot(snapshot);
      consecutiveErrors = 0;
      currentPollMs = intervalMs;
    } catch (err) {
      consecutiveErrors++;
      const backoff = Math.min(intervalMs * Math.pow(2, consecutiveErrors), 300_000);
      currentPollMs = backoff;
      onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      pollingInterval = setTimeout(poll, currentPollMs);
    }
  }

  poll();
}

export function stopPolling(): void {
  if (pollingInterval) {
    clearTimeout(pollingInterval);
    pollingInterval = null;
  }
}

export function getSnapshotHistory(): Snapshot[] {
  return snapshotHistory;
}
