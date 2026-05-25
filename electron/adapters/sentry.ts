import { createServer, type Server } from 'http';
import { randomBytes, createHash } from 'crypto';
import { shell } from 'electron';
import { getToken, setToken, getWatchedSentryProjects } from '../store';
import type { Adapter, Snapshot, Anomaly } from './types';

const API_BASE = 'https://sentry.io/api/0';
const AUTH_URL = 'https://sentry.io/oauth/authorize/';
const TOKEN_URL = 'https://sentry.io/oauth/token/';
const CALLBACK_PORT = 18321;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;

export interface SentryIssue {
  id: string;
  title: string;
  culprit: string;
  level: 'fatal' | 'error' | 'warning' | 'info';
  status: string;
  count: string;
  firstSeen: string;
  lastSeen: string;
  isUnhandled: boolean;
  metadata: { type?: string; value?: string };
  shortId: string;
  project: { slug: string; name: string };
  permalink: string;
}

export interface SentrySnapshot {
  issues: Array<{
    id: string;
    title: string;
    culprit: string;
    level: string;
    count: number;
    firstSeen: string;
    lastSeen: string;
    isUnhandled: boolean;
    shortId: string;
    project: string;
    permalink: string;
    isNew: boolean;
  }>;
  stats: {
    totalErrors24h: number;
    unresolvedCount: number;
    newIssues24h: number;
  };
}

let _cachedToken: string | null = null;
let _orgSlug: string | null = null;
let snapshotHistory: Snapshot[] = [];

async function sentryFetch<T>(endpoint: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Sentry API ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

async function resolveOrg(token: string): Promise<string> {
  if (_orgSlug) return _orgSlug;

  const orgs = await sentryFetch<Array<{ slug: string }>>('/organizations/', token);
  if (orgs.length === 0) throw new Error('No Sentry organizations found');

  _orgSlug = orgs[0].slug;
  return _orgSlug;
}

async function fetchIssues(token: string, org: string): Promise<SentrySnapshot['issues']> {
  const watchedProjects = await getWatchedSentryProjects();
  const projectQuery = watchedProjects.length > 0
    ? watchedProjects.map((p) => `project:${p}`).join(' OR ')
    : '';
  const query = projectQuery
    ? `is:unresolved (${projectQuery})`
    : 'is:unresolved';
  const issues = await sentryFetch<SentryIssue[]>(
    `/organizations/${org}/issues/?query=${encodeURIComponent(query)}&sort=date&limit=15&statsPeriod=14d`,
    token
  );

  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  return issues.map((issue) => ({
    id: issue.id,
    title: issue.title,
    culprit: issue.culprit,
    level: issue.level,
    count: parseInt(issue.count, 10),
    firstSeen: issue.firstSeen,
    lastSeen: issue.lastSeen,
    isUnhandled: issue.isUnhandled,
    shortId: issue.shortId,
    project: issue.project?.slug || issue.project?.name || '',
    permalink: issue.permalink,
    isNew: new Date(issue.firstSeen).getTime() > dayAgo,
  }));
}

async function fetchStats(token: string, org: string): Promise<SentrySnapshot['stats']> {
  // Get project stats for error count
  try {
    const outcomes = await sentryFetch<any>(
      `/organizations/${org}/stats_v2/?field=sum(quantity)&category=error&interval=1h&statsPeriod=24h`,
      token
    );

    let totalErrors24h = 0;
    if (outcomes?.groups?.[0]?.totals?.['sum(quantity)']) {
      totalErrors24h = outcomes.groups[0].totals['sum(quantity)'];
    }

    // Count unresolved issues
    const issues = await sentryFetch<SentryIssue[]>(
      `/organizations/${org}/issues/?query=is:unresolved&limit=1`,
      token
    );

    // Use the X-Hits header if available, otherwise use length
    const unresolvedCount = issues.length;

    // Count new issues in last 24h
    const newIssues = await sentryFetch<SentryIssue[]>(
      `/organizations/${org}/issues/?query=is:unresolved+firstSeen:-24h&limit=1`,
      token
    );

    return {
      totalErrors24h,
      unresolvedCount,
      newIssues24h: newIssues.length,
    };
  } catch {
    return { totalErrors24h: 0, unresolvedCount: 0, newIssues24h: 0 };
  }
}

export const sentryAdapter: Adapter = {
  name: 'sentry',

  isConfigured(): boolean {
    return _cachedToken !== null;
  },

  async fetchSnapshot(): Promise<Snapshot> {
    const token = await getToken('sentry');
    if (!token) throw new Error('Sentry not configured');
    _cachedToken = token;

    const org = await resolveOrg(token);
    const [issues, stats] = await Promise.all([
      fetchIssues(token, org),
      fetchStats(token, org),
    ]);

    const snapshot: Snapshot = {
      source: 'sentry',
      timestamp: Date.now(),
      data: { issues, stats } as unknown as Record<string, any>,
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

    const data = latest.data as unknown as SentrySnapshot;

    // High-volume unhandled errors
    const unhandled = data.issues.filter((i) => i.isUnhandled && i.count > 50);
    if (unhandled.length > 0) {
      anomalies.push({
        source: 'sentry',
        severity: 'warning',
        label: `${unhandled.length} high-volume unhandled error${unhandled.length > 1 ? 's' : ''}`,
        detail: unhandled.map((i) => `${i.project}: ${i.title} (${i.count}x)`).join(', '),
        timestamp: latest.timestamp,
      });
    }

    // New issues spike (5+ new issues in 24h)
    const newIssues = data.issues.filter((i) => i.isNew);
    if (newIssues.length >= 5) {
      anomalies.push({
        source: 'sentry',
        severity: 'critical',
        label: `${newIssues.length} new issues in 24h`,
        detail: newIssues.slice(0, 3).map((i) => i.title).join(', '),
        timestamp: latest.timestamp,
      });
    }

    return anomalies;
  },
};

export async function initAdapter(): Promise<void> {
  const token = await getToken('sentry');
  _cachedToken = token || null;
}

export async function setSentryToken(token: string): Promise<void> {
  // Validate token by resolving org
  const orgs = await sentryFetch<Array<{ slug: string }>>('/organizations/', token);
  if (orgs.length === 0) throw new Error('No Sentry organizations found for this token');
  await setToken('sentry', token);
  _cachedToken = token;
  _orgSlug = orgs[0].slug;
}

export async function disconnectSentry(): Promise<void> {
  const { removeToken } = await import('../store');
  await removeToken('sentry');
  _cachedToken = null;
  _orgSlug = null;
}

export async function listSentryProjects(): Promise<Array<{ slug: string; name: string }>> {
  if (!_cachedToken) throw new Error('Sentry not configured');
  const org = await resolveOrg(_cachedToken);
  const projects = await sentryFetch<Array<{ slug: string; name: string }>>(
    `/organizations/${org}/projects/?per_page=100`,
    _cachedToken,
  );
  return projects.map((p) => ({ slug: p.slug, name: p.name }));
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

export async function startOAuthFlow(clientId: string, clientSecret: string): Promise<string> {
  stopOAuthServer();

  const codeVerifier = generateCodeVerifier();
  const state = randomBytes(16).toString('hex');
  const codeChallenge = generateCodeChallenge(codeVerifier);

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
          await setToken('sentry', tokenData.access_token);
          _cachedToken = tokenData.access_token;
          _orgSlug = null; // reset so it re-resolves with new token

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px;background:#000;color:#34d399"><h2>connected to sentry</h2><p style="color:#999">you can close this tab</p></body></html>');
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
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        scope: 'org:read project:read event:read',
        redirect_uri: REDIRECT_URI,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      shell.openExternal(`${AUTH_URL}?${params.toString()}`);
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
