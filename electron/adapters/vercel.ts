import { createServer, type Server } from 'http';
import { randomBytes, createHash } from 'crypto';
import { shell } from 'electron';
import { getToken, setToken, getWatchedVercelProjects } from '../store';
import type { Adapter, Snapshot, Anomaly } from './types';

const API_BASE = 'https://api.vercel.com';
const AUTH_URL = 'https://vercel.com/oauth/authorize';
const TOKEN_URL = 'https://api.vercel.com/login/oauth/token';
const CALLBACK_PORT = 9847;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;

export interface VercelDeployment {
  uid: string;
  name: string;
  url: string;
  state: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED';
  created: number;
  ready?: number;
  meta?: { githubCommitSha?: string; githubCommitMessage?: string; githubCommitRef?: string };
  creator?: { username: string };
  target?: string | null;
  inspectorUrl?: string;
}

export interface VercelLogLine {
  text: string;
  type: 'error' | 'warning' | 'info';
  timestamp: string;
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
  requestId?: string;
}

export interface VercelSnapshot {
  deployments: Array<{
    uid: string;
    project: string;
    url: string;
    state: string;
    sha: string;
    message: string;
    branch: string;
    author: string;
    target: string;
    createdAt: string;
    readyAt: string | null;
    duration: number | null;
    inspectorUrl: string;
    runtimeLogs?: VercelLogLine[];
  }>;
  projects: Array<{
    id: string;
    name: string;
    latestDeployState: string;
  }>;
  logsPerProject?: Record<string, { runtime: VercelLogLine[]; build: VercelLogLine[] }>;
}

let _cachedToken: string | null = null;
let snapshotHistory: Snapshot[] = [];

async function vercelFetch<T>(endpoint: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Vercel API ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

async function fetchDeployments(token: string): Promise<VercelSnapshot['deployments']> {
  const result = await vercelFetch<{ deployments: VercelDeployment[] }>(
    '/v6/deployments?limit=15&state=BUILDING,ERROR,READY,CANCELED',
    token
  );

  return result.deployments.map((d) => ({
    uid: d.uid,
    project: d.name,
    url: `https://${d.url}`,
    state: d.state,
    sha: d.meta?.githubCommitSha?.slice(0, 7) || '',
    message: d.meta?.githubCommitMessage?.split('\n')[0] || '',
    branch: d.meta?.githubCommitRef || '',
    author: d.creator?.username || '',
    target: d.target || 'preview',
    createdAt: new Date(d.created).toISOString(),
    readyAt: d.ready ? new Date(d.ready).toISOString() : null,
    duration: d.ready ? Math.round((d.ready - d.created) / 1000) : null,
    inspectorUrl: d.inspectorUrl || '',
  }));
}

function parseEventToLogLine(event: any): VercelLogLine | null {
  const proxy = event.payload?.proxy;
  const text = event.payload?.text || event.payload?.message || event.text || '';

  // Extract HTTP metadata from proxy events
  const method = proxy?.method || event.payload?.method;
  const reqPath = proxy?.path || event.payload?.path;
  const statusCode = proxy?.statusCode ?? event.payload?.statusCode;
  const duration = proxy?.duration ?? event.payload?.duration;
  const requestId = event.payload?.requestId || proxy?.requestId;

  // For proxy/request events, generate a readable text if none present
  const displayText = text.trim()
    ? text.slice(0, 500)
    : (method && reqPath && statusCode != null)
      ? `${method} ${reqPath} → ${statusCode}${duration != null ? ` (${duration}ms)` : ''}`
      : '';

  if (!displayText) return null;

  // Determine log level
  let type: VercelLogLine['type'] = 'info';
  if (
    event.payload?.level === 'error' ||
    event.type === 'stderr' ||
    (statusCode != null && statusCode >= 500) ||
    /error|ERR|FATAL|uncaught|exception/i.test(text)
  ) {
    type = 'error';
  } else if (
    event.payload?.level === 'warning' ||
    (statusCode != null && statusCode >= 400 && statusCode < 500) ||
    /warn|WARN/i.test(text)
  ) {
    type = 'warning';
  }

  return {
    text: displayText,
    type,
    timestamp: event.date ? new Date(event.date).toISOString() : '',
    ...(method ? { method } : {}),
    ...(reqPath ? { path: reqPath } : {}),
    ...(statusCode != null ? { statusCode } : {}),
    ...(duration != null ? { duration: Math.round(duration) } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

async function fetchDeployLogs(token: string, deploymentId: string): Promise<{ runtime: VercelLogLine[]; build: VercelLogLine[] }> {
  const runtime: VercelLogLine[] = [];
  const build: VercelLogLine[] = [];

  // Fetch runtime and build logs in parallel (always fetch both)
  const [runtimeRes, buildRes] = await Promise.all([
    fetch(
      `${API_BASE}/v2/deployments/${deploymentId}/events?builds=0&direction=backward&limit=200`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
    ).catch(() => null),
    fetch(
      `${API_BASE}/v2/deployments/${deploymentId}/events?direction=backward&limit=100`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
    ).catch(() => null),
  ]);

  if (runtimeRes?.ok) {
    try {
      const events = await runtimeRes.json() as any[];
      for (const event of events) {
        const line = parseEventToLogLine(event);
        if (line) runtime.push(line);
      }
      runtime.reverse(); // oldest first
    } catch {}
  }

  if (buildRes?.ok) {
    try {
      const events = await buildRes.json() as any[];
      for (const event of events) {
        const line = parseEventToLogLine(event);
        if (line) build.push(line);
      }
      build.reverse();
    } catch {}
  }

  return { runtime, build };
}

async function fetchProjects(token: string): Promise<VercelSnapshot['projects']> {
  const result = await vercelFetch<{ projects: any[] }>(
    '/v9/projects?limit=10',
    token
  );

  return result.projects.map((p: any) => ({
    id: p.id,
    name: p.name,
    latestDeployState: p.targets?.production?.readyState || 'unknown',
  }));
}

export const vercelAdapter: Adapter = {
  name: 'vercel',

  isConfigured(): boolean {
    return _cachedToken !== null;
  },

  async fetchSnapshot(): Promise<Snapshot> {
    const token = await getToken('vercel');
    if (!token) throw new Error('Vercel not configured');
    _cachedToken = token;

    const watched = await getWatchedVercelProjects();
    const [allDeployments, projects] = await Promise.all([
      fetchDeployments(token),
      fetchProjects(token),
    ]);

    // Filter by watched projects if configured
    const deployments = watched.length > 0
      ? allDeployments.filter((d) => watched.includes(d.project))
      : allDeployments;

    // Fetch runtime logs only — from the latest READY deploy (serving real traffic)
    // Runtime logs = serverless function console output, HTTP request events
    const projectNames = [...new Set(deployments.map((d) => d.project))];
    const logsPerProject: Record<string, { runtime: VercelLogLine[]; build: VercelLogLine[] }> = {};

    const logTargets = projectNames.slice(0, 3).map((name) => {
      const latestReady = deployments.find((d) => d.project === name && d.state === 'READY');
      return { name, deploy: latestReady };
    }).filter((t) => t.deploy);

    if (logTargets.length > 0) {
      const emptyResult = { runtime: [] as VercelLogLine[], build: [] as VercelLogLine[] };
      const withTimeout = (p: Promise<typeof emptyResult>, ms: number) =>
        Promise.race([p, new Promise<typeof emptyResult>((r) => setTimeout(() => r(emptyResult), ms))]);

      const results = await Promise.all(
        logTargets.map((t) => withTimeout(fetchDeployLogs(token, t.deploy!.uid), 10_000))
      );

      for (let i = 0; i < logTargets.length; i++) {
        const { runtime, build } = results[i];
        // Only include runtime logs — skip build output entirely
        if (runtime.length > 0) {
          logsPerProject[logTargets[i].name] = { runtime, build: [] };
          logTargets[i].deploy!.runtimeLogs = runtime;
        }
      }
    }

    const snapshot: Snapshot = {
      source: 'vercel',
      timestamp: Date.now(),
      data: { deployments, projects, logsPerProject } as unknown as Record<string, any>,
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

    const data = latest.data as unknown as VercelSnapshot;

    const failedDeploys = data.deployments.filter((d) => d.state === 'ERROR');
    if (failedDeploys.length >= 2) {
      anomalies.push({
        source: 'vercel',
        severity: 'warning',
        label: `${failedDeploys.length} deploy failures`,
        detail: failedDeploys.map((d) => `${d.project} (${d.sha})`).join(', '),
        timestamp: latest.timestamp,
      });
    }

    const buildingTooLong = data.deployments.filter((d) => {
      if (d.state !== 'BUILDING') return false;
      const elapsed = (Date.now() - new Date(d.createdAt).getTime()) / 1000;
      return elapsed > 600; // 10 min
    });
    if (buildingTooLong.length > 0) {
      anomalies.push({
        source: 'vercel',
        severity: 'warning',
        label: 'slow build detected',
        detail: buildingTooLong.map((d) => `${d.project}: ${Math.round((Date.now() - new Date(d.createdAt).getTime()) / 60000)}min`).join(', '),
        timestamp: latest.timestamp,
      });
    }

    return anomalies;
  },
};

export async function initAdapter(): Promise<void> {
  const token = await getToken('vercel');
  _cachedToken = token || null;
}

export async function listVercelProjects(): Promise<Array<{ id: string; name: string }>> {
  const token = await getToken('vercel');
  if (!token) throw new Error('Vercel not configured');
  return fetchProjects(token);
}

export async function setVercelToken(token: string): Promise<void> {
  await setToken('vercel', token);
  _cachedToken = token;
}

export async function disconnectVercel(): Promise<void> {
  const { removeToken } = await import('../store');
  await removeToken('vercel');
  _cachedToken = null;
}

export function getSnapshotHistory(): Snapshot[] {
  return snapshotHistory;
}

// --- OAuth2 Authorization Code + PKCE ---

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

let _oauthServer: Server | null = null;
let _oauthResolve: ((token: string) => void) | null = null;
let _oauthReject: ((err: Error) => void) | null = null;

export interface VercelOAuthResult {
  success: boolean;
  error?: string;
}

export async function startOAuthFlow(clientId: string, clientSecret: string): Promise<string> {
  // Clean up any previous server
  stopOAuthServer();

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = randomBytes(16).toString('hex');

  return new Promise<string>((resolve, reject) => {
    _oauthResolve = resolve;
    _oauthReject = reject;

    _oauthServer = createServer(async (req, res) => {
      const url = new URL(req.url || '', `http://localhost:${CALLBACK_PORT}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }

      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px;background:#000;color:#fff"><h2>authorization denied</h2><p>you can close this tab</p></body></html>');
        stopOAuthServer();
        reject(new Error(error));
        return;
      }

      if (!code || returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px;background:#000;color:#fff"><h2>invalid callback</h2></body></html>');
        stopOAuthServer();
        reject(new Error('invalid state or missing code'));
        return;
      }

      try {
        // Exchange code for token
        const tokenRes = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            code,
            code_verifier: codeVerifier,
            redirect_uri: REDIRECT_URI,
          }),
        });

        const tokenData = await tokenRes.json() as any;

        if (tokenData.access_token) {
          await setToken('vercel', tokenData.access_token);
          _cachedToken = tokenData.access_token;

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px;background:#000;color:#34d399"><h2>connected to vercel</h2><p style="color:#999">you can close this tab</p></body></html>');
          stopOAuthServer();
          resolve(tokenData.access_token);
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px;background:#000;color:#ef4444"><h2>token exchange failed</h2><p style="color:#999">' + (tokenData.error_description || tokenData.error || 'unknown error') + '</p></body></html>');
          stopOAuthServer();
          reject(new Error(tokenData.error_description || tokenData.error || 'token exchange failed'));
        }
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px;background:#000;color:#ef4444"><h2>error</h2></body></html>');
        stopOAuthServer();
        reject(err);
      }
    });

    _oauthServer.listen(CALLBACK_PORT, () => {
      // Build authorization URL
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
      });

      const authUrl = `${AUTH_URL}?${params.toString()}`;
      shell.openExternal(authUrl);
    });

    _oauthServer.on('error', (err) => {
      reject(err);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      if (_oauthServer) {
        stopOAuthServer();
        reject(new Error('OAuth flow timed out'));
      }
    }, 5 * 60 * 1000);
  });
}

export function cancelOAuthFlow(): void {
  stopOAuthServer();
  if (_oauthReject) {
    _oauthReject(new Error('cancelled'));
    _oauthReject = null;
  }
}

function stopOAuthServer(): void {
  if (_oauthServer) {
    _oauthServer.close();
    _oauthServer = null;
  }
  _oauthResolve = null;
}
