import './logger';
import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  screen,
  ipcMain,
  nativeImage,
  shell,
} from 'electron';
import path from 'path';
import {
  githubAdapter,
  initAdapter as initGitHubAdapter,
  startDeviceFlow,
  cancelDeviceFlow,
  onDeviceFlowSuccess,
  setPersonalToken,
  startPolling,
  stopPolling,
  listUserRepos,
  listRepoBranches,
} from './adapters/github';
import {
  vercelAdapter,
  initAdapter as initVercelAdapter,
  setVercelToken,
  disconnectVercel,
  startOAuthFlow as startVercelOAuth,
  cancelOAuthFlow as cancelVercelOAuth,
  listVercelProjects,
} from './adapters/vercel';
import {
  sentryAdapter,
  initAdapter as initSentryAdapter,
  setSentryToken,
  disconnectSentry,
  listSentryProjects,
  startOAuthFlow as startSentryOAuth,
  cancelOAuthFlow as cancelSentryOAuth,
} from './adapters/sentry';
import {
  openaiAdapter,
  initAdapter as initOpenAIAdapter,
  setOpenAIToken,
  disconnectOpenAI,
} from './adapters/openai';
import {
  anthropicAdapter,
  initAdapter as initAnthropicAdapter,
  setAnthropicToken,
  disconnectAnthropic,
  enableLocalMode as enableAnthropicLocalMode,
  isLocalMode as isAnthropicLocalMode,
} from './adapters/anthropic';
import {
  datadogAdapter,
  initAdapter as initDatadogAdapter,
  setDatadogToken,
  disconnectDatadog,
} from './adapters/datadog';
import {
  supabaseAdapter,
  initAdapter as initSupabaseAdapter,
  setSupabaseToken,
  disconnectSupabase,
} from './adapters/supabase';
import { systemMonitorAdapter } from './adapters/system-monitor';
import { removeToken, getAllTokenStatus, getWatchedRepos, setWatchedRepos, getWatchedVercelProjects, setWatchedVercelProjects, getWatchedSentryProjects, setWatchedSentryProjects, getPollingInterval, setPollingInterval as setPollingIntervalStore, getRestingMode, setRestingMode as setRestingModeStore, getLaunchAtLogin, setLaunchAtLogin as setLaunchAtLoginStore, getSmartSilence, setSmartSilence as setSmartSilenceStore, isInSilenceWindow, getLicense, setLicense, clearLicense, getPerformanceMode } from './store';
import os from 'os';
import type { SmartSilenceConfig } from './store';
import type { WatchedRepo } from './store';
import { isLicenseValid, activateLicense, deactivateLicense } from './license';
import { migrateFromElectronStore } from './secure-store';
import { addDeploy, closeHistoryDb } from './history-store';
import type { DeployEvent } from './history-store';
import { getStreakData, initStreakEngine, invalidateStreakCache } from './streak-engine';
import { autoUpdater } from 'electron-updater';
import log from './logger';

// Smart silence — cached config for fast checks during polling
let cachedSilenceConfig: SmartSilenceConfig = { enabled: false, startHour: 19, endHour: 8, weekends: true };

/** Send snapshot to renderer, attaching silenced flag when in quiet hours */
function sendSnapshot(channel: string, data: any): void {
  if (!mainWindow) return;
  const silenced = isInSilenceWindow(cachedSilenceConfig);
  mainWindow.webContents.send(channel, { ...data, _silenced: silenced });
}

// ─── Adaptive Polling Engine ───
// Tracks visibility state and adjusts polling intervals accordingly

type PerformanceMode = 'balanced' | 'light' | 'aggressive';
let _performanceMode: PerformanceMode = 'balanced';
let _windowVisible = false; // true when hover is active (window shown)

// Previous snapshot hashes per adapter — for "nothing changed" detection
const _prevSnapshotHashes: Map<string, string> = new Map();
const _unchangedCounts: Map<string, number> = new Map();

/** Compute a simple hash to detect if snapshot data changed */
function quickHash(data: any): string {
  return JSON.stringify(data).length + ':' + JSON.stringify(data).slice(0, 200);
}

/** Get polling interval multiplier based on current state */
function getPollingMultiplier(adapterName: string): number {
  const silenced = isInSilenceWindow(cachedSilenceConfig);

  // In silence window: poll very infrequently
  if (silenced) return 4; // 4x base interval

  // Performance mode multipliers
  const modeMultiplier = _performanceMode === 'aggressive' ? 4 : _performanceMode === 'light' ? 2 : 1;

  // Window not visible (resting): double the interval
  const visibilityMultiplier = _windowVisible ? 1 : 2;

  // "Nothing changed" backoff — up to 5min cap handled at call site
  const unchanged = _unchangedCounts.get(adapterName) || 0;
  const backoffMultiplier = unchanged >= 3 ? 2 : 1; // double after 3 unchanged polls

  return modeMultiplier * visibilityMultiplier * backoffMultiplier;
}

/** Get adaptive interval (ms) for a given adapter, with max cap of 5 minutes */
function getAdaptiveInterval(adapterName: string, baseMs: number): number {
  const multiplier = getPollingMultiplier(adapterName);
  return Math.min(baseMs * multiplier, 5 * 60 * 1000); // cap at 5 min
}

/** Get system monitor interval based on visibility */
function getSystemMonitorInterval(): number {
  if (_performanceMode === 'aggressive') return 0; // disabled
  if (_performanceMode === 'light') return 15_000;
  // balanced: 5s when visible, 10s when hidden
  return _windowVisible ? 5_000 : 10_000;
}

/** Track if snapshot changed; returns true if data is different from last poll */
function trackSnapshotChange(adapterName: string, data: any): boolean {
  const hash = quickHash(data);
  const prev = _prevSnapshotHashes.get(adapterName);
  _prevSnapshotHashes.set(adapterName, hash);

  if (prev === hash) {
    _unchangedCounts.set(adapterName, (_unchangedCounts.get(adapterName) || 0) + 1);
    return false;
  }
  _unchangedCounts.set(adapterName, 0);
  return true;
}

/** Auto-detect if machine is resource-constrained and set light mode */
async function autoDetectPerformanceMode(): Promise<void> {
  const totalRam = os.totalmem();
  const cpuCores = os.cpus().length;
  const ramGb = totalRam / (1024 * 1024 * 1024);

  if (ramGb < 8 || cpuCores < 4) {
    const stored = await getPerformanceMode();
    // Only auto-set if user hasn't explicitly chosen a mode
    if (stored === 'balanced') {
      _performanceMode = 'light';
      console.log('[vitals] Auto-detected resource-constrained machine (RAM: %.1fGB, Cores: %d) — using light mode', ramGb, cpuCores);
    }
  }
}

// ─── IPC Batching ───
// Accumulate snapshot sends and flush every 500ms

let _ipcBatchBuffer: Array<{ channel: string; data: any }> = [];
let _ipcBatchTimer: ReturnType<typeof setTimeout> | null = null;

function queueIpcSend(channel: string, data: any): void {
  _ipcBatchBuffer.push({ channel, data });
  if (!_ipcBatchTimer) {
    _ipcBatchTimer = setTimeout(flushIpcBatch, 500);
  }
}

function flushIpcBatch(): void {
  _ipcBatchTimer = null;
  if (!mainWindow || mainWindow.isDestroyed() || _ipcBatchBuffer.length === 0) {
    _ipcBatchBuffer = [];
    return;
  }
  // Send each buffered message (batched in time, not combined — keeps channel semantics)
  for (const { channel, data } of _ipcBatchBuffer) {
    mainWindow.webContents.send(channel, data);
  }
  _ipcBatchBuffer = [];
}

// Polling timers
let vercelPollingInterval: ReturnType<typeof setTimeout> | null = null;
let sentryPollingInterval: ReturnType<typeof setTimeout> | null = null;
let openaiPollingInterval: ReturnType<typeof setTimeout> | null = null;
let anthropicPollingInterval: ReturnType<typeof setTimeout> | null = null;
let datadogPollingInterval: ReturnType<typeof setTimeout> | null = null;
let supabasePollingInterval: ReturnType<typeof setTimeout> | null = null;
let systemMonitorPollingInterval: ReturnType<typeof setTimeout> | null = null;

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let activationWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const isDev = !app.isPackaged;
const WINDOW_HEIGHT = 480;
const PROTOCOL = 'vitals';

// Prevent the process from crashing on unhandled errors
process.on('uncaughtException', (err) => {
  console.error('[vitals] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[vitals] Unhandled rejection:', reason);
});

function createTrayIcon(): Electron.NativeImage {
  const size = 22;
  const canvas = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="11" cy="11" r="5" fill="black"/>
    </svg>
  `.trim();
  const img = nativeImage.createFromBuffer(
    Buffer.from(canvas),
    { width: size, height: size }
  );
  img.setTemplateImage(true);
  return img;
}

function createWindow(): void {
  const display = screen.getPrimaryDisplay();
  const { width: screenWidth } = display.bounds;

  mainWindow = new BrowserWindow({
    width: screenWidth,
    height: WINDOW_HEIGHT,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    roundedCorners: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    type: 'panel',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Force y=0 immediately — macOS pushes panel windows below menubar (y=34)
  mainWindow.setPosition(0, 0);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-renderer/index.html'));
  }

  // Re-enforce y=0 after content loads — macOS may reposition again
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.setPosition(0, 0);
  });

  // Also re-enforce when window is shown (after toggle via hotkey)
  mainWindow.on('show', () => {
    mainWindow?.setPosition(0, 0);
  });

  // Recover from renderer crashes — recreate the window
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[vitals] Renderer process gone:', details.reason, details.exitCode);
    mainWindow?.destroy();
    mainWindow = null;
    createWindow();
  });

  mainWindow.on('closed', () => {
    console.error('[vitals] Window was closed unexpectedly, recreating...');
    mainWindow = null;
    createWindow();
  });
}

function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    app.dock?.show();
    settingsWindow.focus();
    return;
  }

  // Show dock so macOS allows the window to appear in foreground
  app.dock?.show();

  settingsWindow = new BrowserWindow({
    width: 820,
    height: 600,
    minWidth: 700,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    backgroundColor: '#1c1c1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    settingsWindow.loadURL('http://localhost:5173/settings.html');
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../dist-renderer/settings.html'));
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null;
    // Hide dock again when settings is closed (unless activation is open)
    if (!activationWindow || activationWindow.isDestroyed()) {
      app.dock?.hide();
    }
  });
}

function openActivationWindow(errorMessage?: string): void {
  if (activationWindow && !activationWindow.isDestroyed()) {
    app.dock?.show();
    activationWindow.focus();
    return;
  }

  app.dock?.show();

  activationWindow = new BrowserWindow({
    width: 500,
    height: 400,
    minWidth: 450,
    minHeight: 380,
    resizable: false,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    backgroundColor: '#1c1c1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    activationWindow.loadURL('http://localhost:5173/activation.html');
  } else {
    activationWindow.loadFile(path.join(__dirname, '../dist-renderer/activation.html'));
  }

  if (errorMessage) {
    activationWindow.webContents.on('did-finish-load', () => {
      activationWindow?.webContents.send('activation:error', errorMessage);
    });
  }

  activationWindow.on('closed', () => {
    activationWindow = null;
    // If no main window and activation closed, quit
    if (!mainWindow) {
      app.quit();
    }
  });
}

function createTray(): void {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Vitals');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Configurações',
      click: () => openSettingsWindow(),
    },
    {
      label: 'Sobre',
      click: () => {
        // TODO: about dialog
      },
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        stopPolling();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function registerShortcuts(): void {
  globalShortcut.register('CommandOrControl+Shift+N', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    }
  });

  // Debug hotkeys — only in development
  if (isDev) {
    const debugStates = [
      'resting',
      'hover',
      'anomaly',
      'incident',
      'deploy_verified',
      'onboarding',
      'settings',
    ];

    debugStates.forEach((state, index) => {
      globalShortcut.register(`CommandOrControl+Shift+${index + 1}`, () => {
        if (mainWindow) {
          mainWindow.webContents.send('state-change', state);
          mainWindow.setIgnoreMouseEvents(false);
        }
      });
    });
  }
}

function setupIPC(): void {
  // Dynamic window resizing
  ipcMain.on('set-window-bounds', (_event, bounds: { width: number; height: number }) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const w = Math.max(100, Math.round(bounds.width));
      const h = Math.max(20, Math.round(bounds.height));
      const display = screen.getPrimaryDisplay();
      const screenWidth = display.bounds.width;
      const x = Math.round((screenWidth - w) / 2);
      mainWindow.setBounds({ x, y: 0, width: w, height: h });
    } catch (err) {
      console.error('[vitals] setBounds error:', err);
    }
  });

  // Mouse events — also track visibility state for adaptive polling
  ipcMain.on('set-ignore-mouse-events', (_event, ignore: boolean) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (ignore) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
      _windowVisible = false;
    } else {
      mainWindow.setIgnoreMouseEvents(false);
      _windowVisible = true;
    }
  });

  // Open external URLs
  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    if (url.startsWith('https://')) {
      await shell.openExternal(url);
    }
  });

  // Screen geometry — tells renderer where notch zones are
  ipcMain.handle('screen:geometry', () => {
    const display = screen.getPrimaryDisplay();
    const screenWidth = display.bounds.width;
    const menuBarHeight = display.workArea.y - display.bounds.y; // 34px on notch Macs
    const hasNotch = menuBarHeight > 24; // regular menu bar is ~24px
    // Notch is approximately 204px wide on 1710-width displays, scales proportionally
    const notchWidth = hasNotch ? Math.round(screenWidth * 0.119) : 0;
    return {
      screenWidth,
      menuBarHeight,
      hasNotch,
      notchWidth,
      notchLeft: Math.round((screenWidth - notchWidth) / 2),
      notchRight: Math.round((screenWidth + notchWidth) / 2),
    };
  });

  // GitHub adapter IPC
  ipcMain.handle('github:start-device-flow', async (_event, clientId: string) => {
    try {
      const status = await startDeviceFlow(clientId);
      // When device flow completes, start polling
      onDeviceFlowSuccess(() => {
        startGitHubPolling();
        broadcastConnectorStatus();
        if (mainWindow) {
          mainWindow.webContents.send('github:device-flow-success');
        }
      });
      return { success: true, data: status };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('github:cancel-device-flow', () => {
    cancelDeviceFlow();
    return { success: true };
  });

  ipcMain.handle('github:set-token', async (_event, token: string) => {
    try {
      await setPersonalToken(token);
      startGitHubPolling();
      broadcastConnectorStatus();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('github:get-snapshot', async () => {
    try {
      const snapshot = await githubAdapter.fetchSnapshot();
      return { success: true, data: snapshot };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('github:is-configured', () => {
    return githubAdapter.isConfigured();
  });

  ipcMain.handle('github:disconnect', async () => {
    stopPolling();
    await removeToken('github');
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('data:clear', 'github');
    broadcastConnectorStatus();
    return { success: true };
  });

  // Repo/branch selection
  ipcMain.handle('github:list-repos', async () => {
    try {
      const repos = await listUserRepos();
      return { success: true, data: repos };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('github:list-branches', async (_event, repoFullName: string) => {
    try {
      const branches = await listRepoBranches(repoFullName);
      return { success: true, data: branches };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('github:get-watched-repos', async () => {
    return await getWatchedRepos();
  });

  ipcMain.handle('github:set-watched-repos', async (_event, repos: WatchedRepo[]) => {
    await setWatchedRepos(repos);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('data:clear', 'github');
      mainWindow.webContents.send('watched-repos:changed', repos);
    }
    return { success: true };
  });

  // Vercel adapter IPC
  ipcMain.handle('vercel:set-token', async (_event, token: string) => {
    try {
      await setVercelToken(token);
      startVercelPolling();
      broadcastConnectorStatus();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('vercel:start-oauth', async (_event, clientId: string, clientSecret: string) => {
    try {
      await startVercelOAuth(clientId, clientSecret);
      startVercelPolling();
      broadcastConnectorStatus();
      if (mainWindow) {
        mainWindow.webContents.send('vercel:oauth-success');
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('vercel:cancel-oauth', () => {
    cancelVercelOAuth();
    return { success: true };
  });

  ipcMain.handle('vercel:disconnect', async () => {
    stopVercelPolling();
    await disconnectVercel();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('data:clear', 'vercel');
    broadcastConnectorStatus();
    return { success: true };
  });

  ipcMain.handle('vercel:get-snapshot', async () => {
    try {
      const snapshot = await vercelAdapter.fetchSnapshot();
      return { success: true, data: snapshot };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // Vercel project selection
  ipcMain.handle('vercel:list-projects', async () => {
    try {
      const projects = await listVercelProjects();
      return { success: true, data: projects };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('vercel:get-watched-projects', async () => {
    return await getWatchedVercelProjects();
  });

  ipcMain.handle('vercel:set-watched-projects', async (_event, projects: string[]) => {
    await setWatchedVercelProjects(projects);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('data:clear', 'vercel');
      mainWindow.webContents.send('watched-vercel-projects:changed', projects);
    }
    return { success: true };
  });

  ipcMain.handle('vercel:redeploy', async (_event, deploymentId: string, projectName: string, target: string) => {
    try {
      const { redeployDeployment } = await import('./adapters/vercel');
      const result = await redeployDeployment(deploymentId, projectName, target);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('vercel:cancel', async (_event, deploymentId: string) => {
    try {
      const { cancelDeployment } = await import('./adapters/vercel');
      await cancelDeployment(deploymentId);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('vercel:rollback', async (_event, projectId: string, deploymentId: string) => {
    try {
      const { promoteDeployment } = await import('./adapters/vercel');
      await promoteDeployment(projectId, deploymentId);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // Sentry adapter IPC
  ipcMain.handle('sentry:set-token', async (_event, token: string) => {
    try {
      await setSentryToken(token);
      startSentryPolling();
      broadcastConnectorStatus();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('sentry:start-oauth', async (_event, clientId: string, clientSecret: string) => {
    try {
      await startSentryOAuth(clientId, clientSecret);
      startSentryPolling();
      broadcastConnectorStatus();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sentry:oauth-success');
      }
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('sentry:oauth-success');
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('sentry:cancel-oauth', () => {
    cancelSentryOAuth();
    return { success: true };
  });

  ipcMain.handle('sentry:disconnect', async () => {
    stopSentryPolling();
    await disconnectSentry();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('data:clear', 'sentry');
    broadcastConnectorStatus();
    return { success: true };
  });

  ipcMain.handle('sentry:list-projects', async () => {
    try {
      const projects = await listSentryProjects();
      return { success: true, data: projects };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('sentry:get-watched-projects', async () => {
    return await getWatchedSentryProjects();
  });

  ipcMain.handle('sentry:set-watched-projects', async (_event, projects: string[]) => {
    await setWatchedSentryProjects(projects);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('data:clear', 'sentry');
    return { success: true };
  });

  ipcMain.handle('sentry:get-snapshot', async () => {
    try {
      const snapshot = await sentryAdapter.fetchSnapshot();
      return { success: true, data: snapshot };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // OpenAI adapter IPC
  ipcMain.handle('openai:set-token', async (_event, token: string) => {
    try {
      await setOpenAIToken(token);
      startOpenAIPolling();
      broadcastConnectorStatus();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('openai:disconnect', async () => {
    stopOpenAIPolling();
    await disconnectOpenAI();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('data:clear', 'openai');
    broadcastConnectorStatus();
    return { success: true };
  });

  ipcMain.handle('openai:get-snapshot', async () => {
    try {
      const snapshot = await openaiAdapter.fetchSnapshot();
      return { success: true, data: snapshot };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // Anthropic adapter IPC
  ipcMain.handle('anthropic:set-token', async (_event, token: string) => {
    try {
      await setAnthropicToken(token);
      startAnthropicPolling();
      broadcastConnectorStatus();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('anthropic:disconnect', async () => {
    stopAnthropicPolling();
    await disconnectAnthropic();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('data:clear', 'anthropic');
    broadcastConnectorStatus();
    return { success: true };
  });

  ipcMain.handle('anthropic:enable-local', async (_event, plan?: string) => {
    try {
      const success = await enableAnthropicLocalMode(plan);
      if (success) {
        startAnthropicPolling();
        broadcastConnectorStatus();
      }
      return { success };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('anthropic:is-local-mode', () => {
    return isAnthropicLocalMode();
  });

  ipcMain.handle('anthropic:get-snapshot', async () => {
    try {
      const snapshot = await anthropicAdapter.fetchSnapshot();
      return { success: true, data: snapshot };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // Datadog adapter IPC
  ipcMain.handle('datadog:set-token', async (_event, token: string) => {
    try {
      await setDatadogToken(token);
      startDatadogPolling();
      broadcastConnectorStatus();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('datadog:disconnect', async () => {
    stopDatadogPolling();
    await disconnectDatadog();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('data:clear', 'datadog');
    broadcastConnectorStatus();
    return { success: true };
  });

  ipcMain.handle('datadog:get-snapshot', async () => {
    try {
      const snapshot = await datadogAdapter.fetchSnapshot();
      return { success: true, data: snapshot };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // Supabase adapter IPC
  ipcMain.handle('supabase:set-token', async (_event, token: string) => {
    try {
      await setSupabaseToken(token);
      startSupabasePolling();
      broadcastConnectorStatus();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('supabase:disconnect', async () => {
    stopSupabasePolling();
    await disconnectSupabase();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('data:clear', 'supabase');
    broadcastConnectorStatus();
    return { success: true };
  });

  ipcMain.handle('supabase:get-snapshot', async () => {
    try {
      const snapshot = await supabaseAdapter.fetchSnapshot();
      return { success: true, data: snapshot };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // Polling interval
  ipcMain.handle('preferences:get-polling-interval', async () => {
    return await getPollingInterval();
  });

  ipcMain.handle('preferences:set-polling-interval', async (_event, sec: number) => {
    await setPollingIntervalStore(sec);
    // Restart all active pollings with new interval
    if (githubAdapter.isConfigured()) { stopPolling(); startGitHubPolling().catch((e) => console.error('[vitals] Polling restart error:', e)); }
    if (vercelAdapter.isConfigured()) { stopVercelPolling(); startVercelPolling().catch((e) => console.error('[vitals] Polling restart error:', e)); }
    if (sentryAdapter.isConfigured()) { stopSentryPolling(); startSentryPolling().catch((e) => console.error('[vitals] Polling restart error:', e)); }
    if (openaiAdapter.isConfigured()) { stopOpenAIPolling(); startOpenAIPolling().catch((e) => console.error('[vitals] Polling restart error:', e)); }
    if (anthropicAdapter.isConfigured()) { stopAnthropicPolling(); startAnthropicPolling().catch((e) => console.error('[vitals] Polling restart error:', e)); }
    if (datadogAdapter.isConfigured()) { stopDatadogPolling(); startDatadogPolling().catch((e) => console.error('[vitals] Polling restart error:', e)); }
    if (supabaseAdapter.isConfigured()) { stopSupabasePolling(); startSupabasePolling().catch((e) => console.error('[vitals] Polling restart error:', e)); }
    return { success: true };
  });

  // Resting mode
  ipcMain.handle('preferences:get-resting-mode', async () => {
    return await getRestingMode();
  });

  ipcMain.handle('preferences:set-resting-mode', async (_event, mode: string) => {
    await setRestingModeStore(mode);
    // Broadcast to all windows
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('preferences:changed', { restingMode: mode });
    }
    return { success: true };
  });

  // Launch at login
  ipcMain.handle('preferences:get-launch-at-login', async () => {
    return await getLaunchAtLogin();
  });

  ipcMain.handle('preferences:set-launch-at-login', async (_event, enabled: boolean) => {
    await setLaunchAtLoginStore(enabled);
    app.setLoginItemSettings({ openAtLogin: enabled });
    return { success: true };
  });

  // Smart silence
  ipcMain.handle('preferences:get-smart-silence', async () => {
    return await getSmartSilence();
  });

  ipcMain.handle('preferences:set-smart-silence', async (_event, config: SmartSilenceConfig) => {
    await setSmartSilenceStore(config);
    cachedSilenceConfig = config;
    return { success: true };
  });

  ipcMain.handle('preferences:is-silenced', async () => {
    return isInSilenceWindow(cachedSilenceConfig);
  });

  ipcMain.handle('preferences:get-performance-mode', async () => {
    return _performanceMode;
  });

  ipcMain.handle('preferences:set-performance-mode', async (_event, mode: string) => {
    const { setPerformanceMode } = await import('./store');
    await setPerformanceMode(mode as 'balanced' | 'light' | 'aggressive');
    _performanceMode = mode as PerformanceMode;
    return { success: true };
  });

  // Vercel logs on demand — only fetch when user hovers
  ipcMain.handle('vercel:fetch-logs', async (_event, projectName?: string) => {
    const { fetchLogsOnDemand } = await import('./adapters/vercel');
    return fetchLogsOnDemand(projectName);
  });

  // Open settings in a separate window
  ipcMain.handle('open-settings', () => {
    openSettingsWindow();
    return { success: true };
  });

  // License IPC
  ipcMain.handle('license:activate', async (_event, key: string) => {
    try {
      const result = await activateLicense(key, setLicense);
      if (result.success) {
        // Close activation window and open main app
        if (activationWindow && !activationWindow.isDestroyed()) {
          activationWindow.close();
          activationWindow = null;
        }
        createWindow();
        createTray();
        registerShortcuts();
        startAllPolling();
      }
      return result;
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('license:status', async () => {
    const license = await getLicense();
    return {
      activated: !!license.key,
      key: license.key,
      machineId: license.machineId,
      lastValidatedAt: license.lastValidatedAt,
    };
  });

  ipcMain.handle('license:deactivate', async () => {
    const license = await getLicense();
    if (license.key && license.instanceId) {
      await deactivateLicense(license.key, license.instanceId);
    }
    await clearLicense();
    return { success: true };
  });

  // Streaks
  ipcMain.handle('streaks:get', () => {
    return getStreakData();
  });

  // Log path
  ipcMain.handle('app:log-path', () => {
    return log.transports.file.getFile().path;
  });

  // Quit app
  ipcMain.handle('app:quit', () => {
    app.quit();
  });

  // Connector status
  ipcMain.handle('connectors:status', async () => {
    const status = await getAllTokenStatus();
    if (isAnthropicLocalMode()) status.anthropic = true;
    return { ...status, system: true };
  });

  async function broadcastConnectorStatus() {
    const status = await getAllTokenStatus();
    status.system = true;
    // Local mode counts as connected
    if (isAnthropicLocalMode()) status.anthropic = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('connectors:changed', status);
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('connectors:changed', status);
    }
  }

  // Force refresh all adapters (in parallel)
  ipcMain.handle('force-refresh', async () => {
    const adapters = [
      { name: 'github', adapter: githubAdapter },
      { name: 'vercel', adapter: vercelAdapter },
      { name: 'sentry', adapter: sentryAdapter },
      { name: 'openai', adapter: openaiAdapter },
      { name: 'anthropic', adapter: anthropicAdapter },
      { name: 'datadog', adapter: datadogAdapter },
      { name: 'supabase', adapter: supabaseAdapter },
      { name: 'system', adapter: systemMonitorAdapter },
    ];

    // Reset backoff state — user explicitly wants fresh data
    _prevSnapshotHashes.clear();
    _unchangedCounts.clear();

    // Tell Supabase to do a full refresh (all projects, with advisors)
    const { resetForFullRefresh } = await import('./adapters/supabase');
    resetForFullRefresh();

    const tasks = adapters
      .filter(({ adapter }) => adapter.isConfigured())
      .map(async ({ name, adapter }) => {
        try {
          const snapshot = await adapter.fetchSnapshot();
          if (mainWindow) mainWindow.webContents.send(`${name}:snapshot`, snapshot);
          return name;
        } catch {
          return null;
        }
      });

    const settled = await Promise.allSettled(tasks);
    const results = settled
      .map((r) => r.status === 'fulfilled' ? r.value : null)
      .filter((name): name is string => name !== null);

    return { success: true, refreshed: results };
  });
}

async function startGitHubPolling(): Promise<void> {
  console.log('[vitals] startGitHubPolling called, isConfigured:', githubAdapter.isConfigured());
  if (!githubAdapter.isConfigured()) return;

  const intervalSec = await getPollingInterval();
  const intervalMs = intervalSec * 1000;
  console.log('[vitals] Polling interval:', intervalSec, 's');

  startPolling(
    (snapshot) => {
      console.log('[vitals] GitHub snapshot received, PRs:', (snapshot.data as any)?.prs?.total, 'Actions:', (snapshot.data as any)?.actions?.recentRuns?.length);
      if (mainWindow) {
        mainWindow.webContents.send('github:snapshot', snapshot);
      }
    },
    (error) => {
      console.error('[vitals] GitHub polling error:', error.message);
      if (mainWindow) {
        mainWindow.webContents.send('github:error', error.message);
      }
    },
    intervalMs
  );
}

async function startVercelPolling(): Promise<void> {
  if (!vercelAdapter.isConfigured()) return;
  const baseIntervalMs = (await getPollingInterval()) * 1000;
  console.log('[vitals] Starting Vercel polling, base interval:', baseIntervalMs / 1000, 's');

  stopVercelPolling();

  async function poll() {
    try {
      const snapshot = await vercelAdapter.fetchSnapshot();
      const changed = trackSnapshotChange('vercel', snapshot.data);
      if (changed) {
        console.log('[vitals] Vercel snapshot received, deploys:', (snapshot.data as any)?.deployments?.length);
      }
      if (mainWindow) {
        queueIpcSend('vercel:snapshot', snapshot);
      }

      // Persist completed deploys to history for streak calculation
      const deployments = (snapshot.data as any)?.deployments || [];
      let streakChanged = false;
      for (const d of deployments) {
        if (d.state === 'READY' || d.state === 'ERROR' || d.state === 'CANCELED') {
          const conclusion = d.state === 'READY' ? 'success' : d.state === 'ERROR' ? 'failure' : 'cancelled';
          const event: DeployEvent = {
            id: d.uid,
            provider: 'vercel',
            projectId: d.project || '',
            commitSha: d.sha || '',
            status: d.state,
            conclusion,
            startedAt: d.createdAt,
            completedAt: d.readyAt || null,
            durationMs: d.duration || null,
            branch: d.branch || '',
            actor: d.author || '',
            metadata: { target: d.target, url: d.url },
          };
          await addDeploy(event);
          if (conclusion === 'success') streakChanged = true;
        }
      }

      if (streakChanged) {
        invalidateStreakCache();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('streaks:updated', await getStreakData());
        }
      }
    } catch (err: any) {
      console.error('[vitals] Vercel polling error:', err.message);
      if (mainWindow) {
        mainWindow.webContents.send('vercel:error', err.message);
      }
    } finally {
      const nextInterval = getAdaptiveInterval('vercel', baseIntervalMs);
      vercelPollingInterval = setTimeout(poll, nextInterval);
    }
  }

  poll();
}

function stopVercelPolling(): void {
  if (vercelPollingInterval) {
    clearTimeout(vercelPollingInterval);
    vercelPollingInterval = null;
  }
}

async function startSentryPolling(): Promise<void> {
  if (!sentryAdapter.isConfigured()) return;
  const baseIntervalMs = (await getPollingInterval()) * 1000;
  console.log('[vitals] Starting Sentry polling, base interval:', baseIntervalMs / 1000, 's');

  stopSentryPolling();

  async function poll() {
    try {
      const snapshot = await sentryAdapter.fetchSnapshot();
      trackSnapshotChange('sentry', snapshot.data);
      if (mainWindow) {
        queueIpcSend('sentry:snapshot', snapshot);
      }
    } catch (err: any) {
      console.error('[vitals] Sentry polling error:', err.message);
      if (mainWindow) {
        mainWindow.webContents.send('sentry:error', err.message);
      }
    } finally {
      sentryPollingInterval = setTimeout(poll, getAdaptiveInterval('sentry', baseIntervalMs));
    }
  }

  poll();
}

function stopSentryPolling(): void {
  if (sentryPollingInterval) {
    clearTimeout(sentryPollingInterval);
    sentryPollingInterval = null;
  }
}

async function startOpenAIPolling(): Promise<void> {
  if (!openaiAdapter.isConfigured()) return;
  const baseIntervalMs = (await getPollingInterval()) * 1000;
  console.log('[vitals] Starting OpenAI polling, base interval:', baseIntervalMs / 1000, 's');

  stopOpenAIPolling();

  async function poll() {
    try {
      const snapshot = await openaiAdapter.fetchSnapshot();
      trackSnapshotChange('openai', snapshot.data);
      if (mainWindow) queueIpcSend('openai:snapshot', snapshot);
    } catch (err: any) {
      console.error('[vitals] OpenAI polling error:', err.message);
      if (mainWindow) mainWindow.webContents.send('openai:error', err.message);
    } finally {
      openaiPollingInterval = setTimeout(poll, getAdaptiveInterval('openai', baseIntervalMs));
    }
  }

  poll();
}

function stopOpenAIPolling(): void {
  if (openaiPollingInterval) {
    clearTimeout(openaiPollingInterval);
    openaiPollingInterval = null;
  }
}

async function startAnthropicPolling(): Promise<void> {
  if (!anthropicAdapter.isConfigured()) return;
  const baseIntervalMs = (await getPollingInterval()) * 1000;
  console.log('[vitals] Starting Anthropic polling, base interval:', baseIntervalMs / 1000, 's');

  stopAnthropicPolling();

  async function poll() {
    try {
      const snapshot = await anthropicAdapter.fetchSnapshot();
      trackSnapshotChange('anthropic', snapshot.data);
      if (mainWindow) queueIpcSend('anthropic:snapshot', snapshot);
    } catch (err: any) {
      console.error('[vitals] Anthropic polling error:', err.message);
      if (mainWindow) mainWindow.webContents.send('anthropic:error', err.message);
    } finally {
      anthropicPollingInterval = setTimeout(poll, getAdaptiveInterval('anthropic', baseIntervalMs));
    }
  }

  poll();
}

function stopAnthropicPolling(): void {
  if (anthropicPollingInterval) {
    clearTimeout(anthropicPollingInterval);
    anthropicPollingInterval = null;
  }
}

async function startDatadogPolling(): Promise<void> {
  if (!datadogAdapter.isConfigured()) return;
  const baseIntervalMs = (await getPollingInterval()) * 1000;
  console.log('[vitals] Starting Datadog polling, base interval:', baseIntervalMs / 1000, 's');

  stopDatadogPolling();

  async function poll() {
    try {
      const snapshot = await datadogAdapter.fetchSnapshot();
      trackSnapshotChange('datadog', snapshot.data);
      if (mainWindow) queueIpcSend('datadog:snapshot', snapshot);
    } catch (err: any) {
      console.error('[vitals] Datadog polling error:', err.message);
      if (mainWindow) mainWindow.webContents.send('datadog:error', err.message);
    } finally {
      datadogPollingInterval = setTimeout(poll, getAdaptiveInterval('datadog', baseIntervalMs));
    }
  }

  poll();
}

function stopDatadogPolling(): void {
  if (datadogPollingInterval) {
    clearTimeout(datadogPollingInterval);
    datadogPollingInterval = null;
  }
}

async function startSupabasePolling(): Promise<void> {
  if (!supabaseAdapter.isConfigured()) return;
  const baseIntervalMs = (await getPollingInterval()) * 1000;
  console.log('[vitals] Starting Supabase polling, base interval:', baseIntervalMs / 1000, 's');

  stopSupabasePolling();

  async function poll() {
    try {
      const snapshot = await supabaseAdapter.fetchSnapshot();
      trackSnapshotChange('supabase', snapshot.data);
      if (mainWindow) queueIpcSend('supabase:snapshot', snapshot);
    } catch (err: any) {
      console.error('[vitals] Supabase polling error:', err.message);
      if (mainWindow) mainWindow.webContents.send('supabase:error', err.message);
    } finally {
      supabasePollingInterval = setTimeout(poll, getAdaptiveInterval('supabase', baseIntervalMs));
    }
  }

  poll();
}

function stopSupabasePolling(): void {
  if (supabasePollingInterval) {
    clearTimeout(supabasePollingInterval);
    supabasePollingInterval = null;
  }
}

async function startSystemMonitorPolling(): Promise<void> {
  const intervalMs = getSystemMonitorInterval();
  if (intervalMs === 0) {
    console.log('[vitals] System Monitor disabled (aggressive mode)');
    return;
  }
  console.log('[vitals] Starting System Monitor polling, interval:', intervalMs / 1000, 's');

  stopSystemMonitorPolling();

  async function poll() {
    const currentInterval = getSystemMonitorInterval();
    if (currentInterval === 0) return; // mode changed to aggressive

    try {
      const snapshot = await systemMonitorAdapter.fetchSnapshot();
      if (mainWindow) mainWindow.webContents.send('system:snapshot', snapshot);
    } catch (err: any) {
      console.error('[vitals] System Monitor polling error:', err.message);
    } finally {
      systemMonitorPollingInterval = setTimeout(poll, currentInterval);
    }
  }

  poll();
}

function stopSystemMonitorPolling(): void {
  if (systemMonitorPollingInterval) {
    clearTimeout(systemMonitorPollingInterval);
    systemMonitorPollingInterval = null;
  }
}

function startAllPolling(): void {
  const pollingStarters = [
    { configured: githubAdapter.isConfigured(), start: startGitHubPolling },
    { configured: vercelAdapter.isConfigured(), start: startVercelPolling },
    { configured: sentryAdapter.isConfigured(), start: startSentryPolling },
    { configured: openaiAdapter.isConfigured(), start: startOpenAIPolling },
    { configured: anthropicAdapter.isConfigured(), start: startAnthropicPolling },
    { configured: datadogAdapter.isConfigured(), start: startDatadogPolling },
    { configured: supabaseAdapter.isConfigured(), start: startSupabasePolling },
    { configured: true, start: startSystemMonitorPolling },
  ];
  const activeStarters = pollingStarters.filter((s) => s.configured);
  // Distribute polls uniformly: if 6 adapters, stagger ~5s apart to avoid burst
  const staggerMs = activeStarters.length > 1 ? Math.round(10_000 / activeStarters.length) : 0;
  activeStarters.forEach((s, i) => {
    setTimeout(() => s.start().catch((err: any) => console.error('[vitals] Polling start error:', err)), i * staggerMs);
  });
}

function handleProtocolUrl(url: string): void {
  // Device flow doesn't use protocol callbacks, but keep handler for future use
  try {
    const parsed = new URL(url);
    if (mainWindow) {
      mainWindow.show();
    }
  } catch {
    // invalid URL, ignore
  }
}

// Register protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// Handle protocol on macOS (single instance)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (url) handleProtocolUrl(url);
    if (mainWindow) mainWindow.show();
  });

  // macOS: handle protocol via open-url
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
  });
}

// Hide from dock
app.dock?.hide();

app.on('ready', async () => {
  // Migrate tokens from old electron-store to safeStorage (Keychain) — idempotent
  await migrateFromElectronStore();

  setupIPC();
  await Promise.allSettled([initGitHubAdapter(), initVercelAdapter(), initSentryAdapter(), initOpenAIAdapter(), initAnthropicAdapter(), initDatadogAdapter(), initSupabaseAdapter()]);
  // Sync preferences on startup
  cachedSilenceConfig = await getSmartSilence();
  _performanceMode = await getPerformanceMode() as PerformanceMode;
  await autoDetectPerformanceMode();
  const launchEnabled = await getLaunchAtLogin();
  app.setLoginItemSettings({ openAtLogin: launchEnabled });

  // License gate — check before opening main window
  const licenseResult = await isLicenseValid(getLicense, setLicense);

  if (!licenseResult.valid) {
    // Show activation window
    openActivationWindow(licenseResult.error);
    return;
  }

  // License valid — proceed normally
  createWindow();
  createTray();
  registerShortcuts();
  startAllPolling();

  // Initialize streak engine — push updates to renderer on day rollover
  initStreakEngine(async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('streaks:updated', await getStreakData());
    }
  });

  // Auto-updater — unsigned builds need signature verification skipped
  process.env.ELECTRON_SKIP_BINARY_SIGNATURE_VERIFICATION = '1';
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = log;
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
});

app.on('will-quit', () => {
  stopPolling();
  stopVercelPolling();
  stopSentryPolling();
  stopOpenAIPolling();
  stopAnthropicPolling();
  stopDatadogPolling();
  stopSupabasePolling();
  stopSystemMonitorPolling();
  globalShortcut.unregisterAll();
  closeHistoryDb();
});

app.on('window-all-closed', () => {
  // Do nothing — keep app alive
});
