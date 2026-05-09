import WebSocket from 'ws';
import { getToken, setToken, removeToken } from '../store';
import type { Adapter, Snapshot, Anomaly } from './types';

interface CDPTarget {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl?: string;
}

interface ConsoleEntry {
  timestamp: number;
  level: 'log' | 'warning' | 'error' | 'info' | 'debug';
  text: string;
  source?: string;
  url?: string;
  line?: number;
}

interface NetworkEntry {
  timestamp: number;
  method: string;
  url: string;
  status: number | null;
  type: string;
  duration: number | null;
  size: number | null;
  failed: boolean;
  error?: string;
  requestHeaders: Record<string, string>;
  postData?: string;
}

export interface ChromeSnapshot {
  connected: boolean;
  tabTitle: string;
  tabUrl: string;
  console: ConsoleEntry[];
  network: NetworkEntry[];
  stats: {
    totalRequests: number;
    failedRequests: number;
    errors: number;
    warnings: number;
    avgResponseTime: number | null;
  };
}

let _debugPort: string | null = null;
let _ws: WebSocket | null = null;
let _connected = false;
let _tabTitle = '';
let _tabUrl = '';
let _consoleEntries: ConsoleEntry[] = [];
let _networkEntries: NetworkEntry[] = [];
let _pendingRequests = new Map<string, { method: string; url: string; type: string; timestamp: number; headers: Record<string, string>; postData?: string }>();
let _msgId = 1;
let snapshotHistory: Snapshot[] = [];
let _onSnapshotCallback: ((snapshot: Snapshot) => void) | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const MAX_ENTRIES = 200;

function sendCDP(method: string, params: any = {}): void {
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify({ id: _msgId++, method, params }));
  }
}

async function listTabs(port: string): Promise<CDPTarget[]> {
  const res = await fetch(`http://127.0.0.1:${port}/json`);
  if (!res.ok) throw new Error(`Chrome debug port ${port} not reachable`);
  return res.json() as Promise<CDPTarget[]>;
}

async function connectToTab(port: string, targetId?: string): Promise<void> {
  disconnect();

  const tabs = await listTabs(port);
  const pageTabs = tabs.filter((t) => t.type === 'page');
  if (pageTabs.length === 0) throw new Error('No open tabs found');

  const target = targetId
    ? pageTabs.find((t) => t.id === targetId) || pageTabs[0]
    : pageTabs[0];

  if (!target.webSocketDebuggerUrl) {
    throw new Error('Tab has no debugger URL — is another debugger already attached?');
  }

  _tabTitle = target.title;
  _tabUrl = target.url;
  _consoleEntries = [];
  _networkEntries = [];
  _pendingRequests.clear();

  return new Promise((resolve, reject) => {
    _ws = new WebSocket(target.webSocketDebuggerUrl!);

    const timeout = setTimeout(() => {
      reject(new Error('WebSocket connection timeout'));
      _ws?.close();
    }, 5000);

    _ws.on('open', () => {
      clearTimeout(timeout);
      _connected = true;

      // Enable Console and Network domains
      sendCDP('Console.enable');
      sendCDP('Runtime.enable');
      sendCDP('Network.enable');
      sendCDP('Log.enable');

      resolve();
    });

    _ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        handleCDPEvent(msg);
      } catch {
        // ignore parse errors
      }
    });

    _ws.on('close', () => {
      _connected = false;
      scheduleReconnect();
    });

    _ws.on('error', (err: Error) => {
      clearTimeout(timeout);
      _connected = false;
      if (!_ws) reject(err);
    });
  });
}

function scheduleReconnect(): void {
  if (_reconnectTimer) return;
  if (!_debugPort) return;
  _reconnectTimer = setTimeout(async () => {
    _reconnectTimer = null;
    if (_debugPort && !_connected) {
      try {
        await connectToTab(_debugPort);
      } catch {
        scheduleReconnect();
      }
    }
  }, 3000);
}

function handleCDPEvent(msg: any): void {
  const { method, params } = msg;
  if (!method) return;

  // Console messages
  if (method === 'Runtime.consoleAPICalled') {
    const entry: ConsoleEntry = {
      timestamp: Date.now(),
      level: mapConsoleLevel(params.type),
      text: (params.args || []).map((a: any) => a.value ?? a.description ?? '').join(' '),
    };
    pushConsole(entry);
  }

  if (method === 'Runtime.exceptionThrown') {
    const exc = params.exceptionDetails;
    const entry: ConsoleEntry = {
      timestamp: Date.now(),
      level: 'error',
      text: exc?.exception?.description || exc?.text || 'Uncaught exception',
      url: exc?.url,
      line: exc?.lineNumber,
    };
    pushConsole(entry);
  }

  if (method === 'Console.messageAdded') {
    const m = params.message;
    const entry: ConsoleEntry = {
      timestamp: Date.now(),
      level: mapConsoleLevel(m.level),
      text: m.text || '',
      source: m.source,
      url: m.url,
      line: m.line,
    };
    pushConsole(entry);
  }

  if (method === 'Log.entryAdded') {
    const e = params.entry;
    const entry: ConsoleEntry = {
      timestamp: Date.now(),
      level: mapConsoleLevel(e.level),
      text: e.text || '',
      source: e.source,
      url: e.url,
      line: e.lineNumber,
    };
    pushConsole(entry);
  }

  // Network
  if (method === 'Network.requestWillBeSent') {
    _pendingRequests.set(params.requestId, {
      method: params.request.method,
      url: params.request.url,
      type: params.type || 'Other',
      timestamp: Date.now(),
      headers: params.request.headers || {},
      postData: params.request.postData,
    });
  }

  if (method === 'Network.responseReceived') {
    const pending = _pendingRequests.get(params.requestId);
    if (pending) {
      const entry: NetworkEntry = {
        timestamp: pending.timestamp,
        method: pending.method,
        url: pending.url,
        status: params.response.status,
        type: pending.type,
        duration: Date.now() - pending.timestamp,
        size: params.response.headers?.['content-length']
          ? parseInt(params.response.headers['content-length'], 10)
          : null,
        failed: false,
        requestHeaders: pending.headers,
        postData: pending.postData,
      };
      pushNetwork(entry);
      _pendingRequests.delete(params.requestId);
    }
  }

  if (method === 'Network.loadingFailed') {
    const pending = _pendingRequests.get(params.requestId);
    if (pending) {
      const entry: NetworkEntry = {
        timestamp: pending.timestamp,
        method: pending.method,
        url: pending.url,
        status: null,
        type: pending.type,
        duration: Date.now() - pending.timestamp,
        size: null,
        failed: true,
        error: params.errorText,
        requestHeaders: pending.headers,
        postData: pending.postData,
      };
      pushNetwork(entry);
      _pendingRequests.delete(params.requestId);
    }
  }

  // Tab navigation
  if (method === 'Page.frameNavigated' && params.frame?.url) {
    _tabUrl = params.frame.url;
  }
}

function mapConsoleLevel(level: string): ConsoleEntry['level'] {
  if (level === 'warning' || level === 'warn') return 'warning';
  if (level === 'error') return 'error';
  if (level === 'info') return 'info';
  if (level === 'debug' || level === 'verbose') return 'debug';
  return 'log';
}

function pushConsole(entry: ConsoleEntry): void {
  _consoleEntries.push(entry);
  if (_consoleEntries.length > MAX_ENTRIES) {
    _consoleEntries = _consoleEntries.slice(-MAX_ENTRIES);
  }
  emitSnapshot();
}

function pushNetwork(entry: NetworkEntry): void {
  _networkEntries.push(entry);
  if (_networkEntries.length > MAX_ENTRIES) {
    _networkEntries = _networkEntries.slice(-MAX_ENTRIES);
  }
  emitSnapshot();
}

function buildSnapshot(): ChromeSnapshot {
  const errors = _consoleEntries.filter((e) => e.level === 'error').length;
  const warnings = _consoleEntries.filter((e) => e.level === 'warning').length;
  const failedReqs = _networkEntries.filter((e) => e.failed).length;
  const durations = _networkEntries.filter((e) => e.duration != null).map((e) => e.duration!);
  const avgResponseTime = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;

  return {
    connected: _connected,
    tabTitle: _tabTitle,
    tabUrl: _tabUrl,
    console: _consoleEntries.slice(-50),
    network: _networkEntries.slice(-50),
    stats: {
      totalRequests: _networkEntries.length,
      failedRequests: failedReqs,
      errors,
      warnings,
      avgResponseTime,
    },
  };
}

// Debounce snapshot emissions to avoid flooding
let _emitTimer: ReturnType<typeof setTimeout> | null = null;

function emitSnapshot(): void {
  if (_emitTimer) return;
  _emitTimer = setTimeout(() => {
    _emitTimer = null;
    if (_onSnapshotCallback) {
      const snap = chromeAdapter.fetchSnapshotSync();
      _onSnapshotCallback(snap);
    }
  }, 500);
}

function disconnect(): void {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  if (_ws) {
    _ws.removeAllListeners();
    _ws.close();
    _ws = null;
  }
  _connected = false;
}

export const chromeAdapter: Adapter & { fetchSnapshotSync: () => Snapshot } = {
  name: 'chrome',

  isConfigured(): boolean {
    return _debugPort !== null;
  },

  async fetchSnapshot(): Promise<Snapshot> {
    const data = buildSnapshot();
    const snapshot: Snapshot = {
      source: 'chrome',
      timestamp: Date.now(),
      data: data as unknown as Record<string, any>,
    };

    snapshotHistory.push(snapshot);
    if (snapshotHistory.length > 120) {
      snapshotHistory = snapshotHistory.slice(-120);
    }

    return snapshot;
  },

  fetchSnapshotSync(): Snapshot {
    const data = buildSnapshot();
    return {
      source: 'chrome',
      timestamp: Date.now(),
      data: data as unknown as Record<string, any>,
    };
  },

  detectAnomalies(history: Snapshot[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const latest = history[history.length - 1];
    if (!latest) return anomalies;

    const data = latest.data as unknown as ChromeSnapshot;

    if (data.stats.errors > 10) {
      anomalies.push({
        source: 'chrome',
        severity: 'warning',
        label: `${data.stats.errors} console errors detected`,
        detail: `Tab: ${data.tabTitle}`,
        timestamp: latest.timestamp,
      });
    }

    if (data.stats.failedRequests > 5) {
      anomalies.push({
        source: 'chrome',
        severity: 'warning',
        label: `${data.stats.failedRequests} failed network requests`,
        detail: `Tab: ${data.tabTitle}`,
        timestamp: latest.timestamp,
      });
    }

    if (data.stats.avgResponseTime && data.stats.avgResponseTime > 3000) {
      anomalies.push({
        source: 'chrome',
        severity: 'critical',
        label: `Slow responses: avg ${data.stats.avgResponseTime}ms`,
        detail: `Tab: ${data.tabTitle}`,
        timestamp: latest.timestamp,
      });
    }

    return anomalies;
  },
};

export async function initAdapter(): Promise<void> {
  const port = await getToken('chrome');
  _debugPort = port || null;
  if (_debugPort) {
    try {
      await connectToTab(_debugPort);
    } catch {
      // Chrome may not be running yet — will reconnect
    }
  }
}

export async function setChromePort(port: string): Promise<void> {
  await setToken('chrome', port);
  _debugPort = port;
  await connectToTab(port);
}

export async function disconnectChrome(): Promise<void> {
  await removeToken('chrome');
  disconnect();
  _debugPort = null;
  _consoleEntries = [];
  _networkEntries = [];
  _tabTitle = '';
  _tabUrl = '';
}

export async function listChromeTabs(port: string): Promise<Array<{ id: string; title: string; url: string }>> {
  const tabs = await listTabs(port);
  return tabs
    .filter((t) => t.type === 'page')
    .map((t) => ({ id: t.id, title: t.title, url: t.url }));
}

export async function switchTab(targetId: string): Promise<void> {
  if (!_debugPort) throw new Error('Chrome not configured');
  await connectToTab(_debugPort, targetId);
}

export function setSnapshotCallback(cb: ((snapshot: Snapshot) => void) | null): void {
  _onSnapshotCallback = cb;
}

export function getSnapshotHistory(): Snapshot[] {
  return snapshotHistory;
}

export function stopChrome(): void {
  disconnect();
}
