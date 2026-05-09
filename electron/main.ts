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
} from './adapters/anthropic';
import {
  datadogAdapter,
  initAdapter as initDatadogAdapter,
  setDatadogToken,
  disconnectDatadog,
} from './adapters/datadog';
import {
  posthogAdapter,
  initAdapter as initPostHogAdapter,
  setPostHogToken,
  disconnectPostHog,
} from './adapters/posthog';
import {
  segmentAdapter,
  initAdapter as initSegmentAdapter,
  setSegmentToken,
  disconnectSegment,
} from './adapters/segment';
import {
  chromeAdapter,
  initAdapter as initChromeAdapter,
  setChromePort,
  disconnectChrome,
  listChromeTabs,
  switchTab as chromeSwitchTab,
  setSnapshotCallback as setChromeSnapshotCallback,
  stopChrome,
} from './adapters/chrome';
import { removeToken, getAllTokenStatus, getWatchedRepos, setWatchedRepos, getWatchedVercelProjects, setWatchedVercelProjects, getWatchedSentryProjects, setWatchedSentryProjects, getPollingInterval, setPollingInterval as setPollingIntervalStore, getRestingMode, setRestingMode as setRestingModeStore, getLaunchAtLogin, setLaunchAtLogin as setLaunchAtLoginStore, getSmartSilence, setSmartSilence as setSmartSilenceStore, isInSilenceWindow } from './store';
import type { SmartSilenceConfig } from './store';
import type { WatchedRepo } from './store';

// Smart silence — cached config for fast checks during polling
let cachedSilenceConfig: SmartSilenceConfig = { enabled: false, startHour: 19, endHour: 8, weekends: true };

/** Send snapshot to renderer, attaching silenced flag when in quiet hours */
function sendSnapshot(channel: string, data: any): void {
  if (!mainWindow) return;
  const silenced = isInSilenceWindow(cachedSilenceConfig);
  mainWindow.webContents.send(channel, { ...data, _silenced: silenced });
}

// Polling timers
let vercelPollingInterval: ReturnType<typeof setTimeout> | null = null;
let sentryPollingInterval: ReturnType<typeof setTimeout> | null = null;
let openaiPollingInterval: ReturnType<typeof setTimeout> | null = null;
let anthropicPollingInterval: ReturnType<typeof setTimeout> | null = null;
let datadogPollingInterval: ReturnType<typeof setTimeout> | null = null;
let posthogPollingInterval: ReturnType<typeof setTimeout> | null = null;
let segmentPollingInterval: ReturnType<typeof setTimeout> | null = null;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const isDev = process.env.NODE_ENV !== 'production';
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

function createTray(): void {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Vitals');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Configurações',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('state-change', 'settings');
          mainWindow.setIgnoreMouseEvents(false);
          mainWindow.show();
        }
      },
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

  // Mouse events
  ipcMain.on('set-ignore-mouse-events', (_event, ignore: boolean) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (ignore) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      mainWindow.setIgnoreMouseEvents(false);
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
    return { success: true };
  });

  // Vercel adapter IPC
  ipcMain.handle('vercel:set-token', async (_event, token: string) => {
    try {
      await setVercelToken(token);
      startVercelPolling();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('vercel:start-oauth', async (_event, clientId: string, clientSecret: string) => {
    try {
      await startVercelOAuth(clientId, clientSecret);
      startVercelPolling();
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
    return { success: true };
  });

  // Sentry adapter IPC
  ipcMain.handle('sentry:set-token', async (_event, token: string) => {
    try {
      await setSentryToken(token);
      startSentryPolling();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('sentry:disconnect', async () => {
    stopSentryPolling();
    await disconnectSentry();
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
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('openai:disconnect', async () => {
    stopOpenAIPolling();
    await disconnectOpenAI();
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
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('anthropic:disconnect', async () => {
    stopAnthropicPolling();
    await disconnectAnthropic();
    return { success: true };
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
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('datadog:disconnect', async () => {
    stopDatadogPolling();
    await disconnectDatadog();
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

  // PostHog adapter IPC
  ipcMain.handle('posthog:set-token', async (_event, token: string) => {
    try {
      await setPostHogToken(token);
      startPostHogPolling();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('posthog:disconnect', async () => {
    stopPostHogPolling();
    await disconnectPostHog();
    return { success: true };
  });

  ipcMain.handle('posthog:get-snapshot', async () => {
    try {
      const snapshot = await posthogAdapter.fetchSnapshot();
      return { success: true, data: snapshot };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // Segment adapter IPC
  ipcMain.handle('segment:set-token', async (_event, token: string) => {
    try {
      await setSegmentToken(token);
      startSegmentPolling();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('segment:disconnect', async () => {
    stopSegmentPolling();
    await disconnectSegment();
    return { success: true };
  });

  ipcMain.handle('segment:get-snapshot', async () => {
    try {
      const snapshot = await segmentAdapter.fetchSnapshot();
      return { success: true, data: snapshot };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // Chrome CDP
  ipcMain.handle('chrome:set-port', async (_event, port: string) => {
    try {
      await setChromePort(port);
      // Set up live snapshot callback
      setChromeSnapshotCallback((snapshot) => {
        if (mainWindow) mainWindow.webContents.send('chrome:snapshot', snapshot);
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('chrome:disconnect', async () => {
    setChromeSnapshotCallback(null);
    await disconnectChrome();
    return { success: true };
  });

  ipcMain.handle('chrome:list-tabs', async (_event, port: string) => {
    try {
      const tabs = await listChromeTabs(port);
      return { success: true, data: tabs };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('chrome:switch-tab', async (_event, targetId: string) => {
    try {
      await chromeSwitchTab(targetId);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('chrome:get-snapshot', async () => {
    try {
      const snapshot = await chromeAdapter.fetchSnapshot();
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
    if (posthogAdapter.isConfigured()) { stopPostHogPolling(); startPostHogPolling().catch((e) => console.error('[vitals] Polling restart error:', e)); }
    if (segmentAdapter.isConfigured()) { stopSegmentPolling(); startSegmentPolling().catch((e) => console.error('[vitals] Polling restart error:', e)); }
    return { success: true };
  });

  // Resting mode
  ipcMain.handle('preferences:get-resting-mode', async () => {
    return await getRestingMode();
  });

  ipcMain.handle('preferences:set-resting-mode', async (_event, mode: string) => {
    await setRestingModeStore(mode);
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

  // Connector status
  ipcMain.handle('connectors:status', async () => {
    return await getAllTokenStatus();
  });

  // Force refresh all adapters (in parallel)
  ipcMain.handle('force-refresh', async () => {
    const adapters = [
      { name: 'github', adapter: githubAdapter },
      { name: 'vercel', adapter: vercelAdapter },
      { name: 'sentry', adapter: sentryAdapter },
      { name: 'openai', adapter: openaiAdapter },
      { name: 'anthropic', adapter: anthropicAdapter },
      { name: 'datadog', adapter: datadogAdapter },
      { name: 'posthog', adapter: posthogAdapter },
      { name: 'segment', adapter: segmentAdapter },
      { name: 'chrome', adapter: chromeAdapter },
    ];

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
  const intervalMs = (await getPollingInterval()) * 1000;
  console.log('[vitals] Starting Vercel polling, interval:', intervalMs / 1000, 's');

  stopVercelPolling();

  async function poll() {
    try {
      const snapshot = await vercelAdapter.fetchSnapshot();
      console.log('[vitals] Vercel snapshot received, deploys:', (snapshot.data as any)?.deployments?.length);
      if (mainWindow) {
        mainWindow.webContents.send('vercel:snapshot', snapshot);
      }
    } catch (err: any) {
      console.error('[vitals] Vercel polling error:', err.message);
      if (mainWindow) {
        mainWindow.webContents.send('vercel:error', err.message);
      }
    } finally {
      vercelPollingInterval = setTimeout(poll, intervalMs);
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
  const intervalMs = (await getPollingInterval()) * 1000;
  console.log('[vitals] Starting Sentry polling, interval:', intervalMs / 1000, 's');

  stopSentryPolling();

  async function poll() {
    try {
      const snapshot = await sentryAdapter.fetchSnapshot();
      console.log('[vitals] Sentry snapshot received, issues:', (snapshot.data as any)?.issues?.length);
      if (mainWindow) {
        mainWindow.webContents.send('sentry:snapshot', snapshot);
      }
    } catch (err: any) {
      console.error('[vitals] Sentry polling error:', err.message);
      if (mainWindow) {
        mainWindow.webContents.send('sentry:error', err.message);
      }
    } finally {
      sentryPollingInterval = setTimeout(poll, intervalMs);
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
  const intervalMs = (await getPollingInterval()) * 1000;
  console.log('[vitals] Starting OpenAI polling, interval:', intervalMs / 1000, 's');

  stopOpenAIPolling();

  async function poll() {
    try {
      const snapshot = await openaiAdapter.fetchSnapshot();
      console.log('[vitals] OpenAI snapshot received');
      if (mainWindow) mainWindow.webContents.send('openai:snapshot', snapshot);
    } catch (err: any) {
      console.error('[vitals] OpenAI polling error:', err.message);
      if (mainWindow) mainWindow.webContents.send('openai:error', err.message);
    } finally {
      openaiPollingInterval = setTimeout(poll, intervalMs);
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
  const intervalMs = (await getPollingInterval()) * 1000;
  console.log('[vitals] Starting Anthropic polling, interval:', intervalMs / 1000, 's');

  stopAnthropicPolling();

  async function poll() {
    try {
      const snapshot = await anthropicAdapter.fetchSnapshot();
      console.log('[vitals] Anthropic snapshot received');
      if (mainWindow) mainWindow.webContents.send('anthropic:snapshot', snapshot);
    } catch (err: any) {
      console.error('[vitals] Anthropic polling error:', err.message);
      if (mainWindow) mainWindow.webContents.send('anthropic:error', err.message);
    } finally {
      anthropicPollingInterval = setTimeout(poll, intervalMs);
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
  const intervalMs = (await getPollingInterval()) * 1000;
  console.log('[vitals] Starting Datadog polling, interval:', intervalMs / 1000, 's');

  stopDatadogPolling();

  async function poll() {
    try {
      const snapshot = await datadogAdapter.fetchSnapshot();
      console.log('[vitals] Datadog snapshot received');
      if (mainWindow) mainWindow.webContents.send('datadog:snapshot', snapshot);
    } catch (err: any) {
      console.error('[vitals] Datadog polling error:', err.message);
      if (mainWindow) mainWindow.webContents.send('datadog:error', err.message);
    } finally {
      datadogPollingInterval = setTimeout(poll, intervalMs);
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

async function startPostHogPolling(): Promise<void> {
  if (!posthogAdapter.isConfigured()) return;
  const intervalMs = (await getPollingInterval()) * 1000;
  console.log('[vitals] Starting PostHog polling, interval:', intervalMs / 1000, 's');

  stopPostHogPolling();

  async function poll() {
    try {
      const snapshot = await posthogAdapter.fetchSnapshot();
      console.log('[vitals] PostHog snapshot received');
      if (mainWindow) mainWindow.webContents.send('posthog:snapshot', snapshot);
    } catch (err: any) {
      console.error('[vitals] PostHog polling error:', err.message);
      if (mainWindow) mainWindow.webContents.send('posthog:error', err.message);
    } finally {
      posthogPollingInterval = setTimeout(poll, intervalMs);
    }
  }

  poll();
}

function stopPostHogPolling(): void {
  if (posthogPollingInterval) {
    clearTimeout(posthogPollingInterval);
    posthogPollingInterval = null;
  }
}

async function startSegmentPolling(): Promise<void> {
  if (!segmentAdapter.isConfigured()) return;
  const intervalMs = (await getPollingInterval()) * 1000;
  console.log('[vitals] Starting Segment polling, interval:', intervalMs / 1000, 's');

  stopSegmentPolling();

  async function poll() {
    try {
      const snapshot = await segmentAdapter.fetchSnapshot();
      console.log('[vitals] Segment snapshot received');
      if (mainWindow) mainWindow.webContents.send('segment:snapshot', snapshot);
    } catch (err: any) {
      console.error('[vitals] Segment polling error:', err.message);
      if (mainWindow) mainWindow.webContents.send('segment:error', err.message);
    } finally {
      segmentPollingInterval = setTimeout(poll, intervalMs);
    }
  }

  poll();
}

function stopSegmentPolling(): void {
  if (segmentPollingInterval) {
    clearTimeout(segmentPollingInterval);
    segmentPollingInterval = null;
  }
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
  setupIPC();
  await Promise.allSettled([initGitHubAdapter(), initVercelAdapter(), initSentryAdapter(), initOpenAIAdapter(), initAnthropicAdapter(), initDatadogAdapter(), initPostHogAdapter(), initSegmentAdapter(), initChromeAdapter()]);
  // Set up Chrome live snapshot callback if already configured
  if (chromeAdapter.isConfigured()) {
    setChromeSnapshotCallback((snapshot) => {
      if (mainWindow) mainWindow.webContents.send('chrome:snapshot', snapshot);
    });
  }
  // Sync preferences on startup
  cachedSilenceConfig = await getSmartSilence();
  const launchEnabled = await getLaunchAtLogin();
  app.setLoginItemSettings({ openAtLogin: launchEnabled });

  createWindow();
  createTray();
  registerShortcuts();

  // Stagger polling starts to avoid request bursts
  const pollingStarters = [
    { configured: githubAdapter.isConfigured(), start: startGitHubPolling },
    { configured: vercelAdapter.isConfigured(), start: startVercelPolling },
    { configured: sentryAdapter.isConfigured(), start: startSentryPolling },
    { configured: openaiAdapter.isConfigured(), start: startOpenAIPolling },
    { configured: anthropicAdapter.isConfigured(), start: startAnthropicPolling },
    { configured: datadogAdapter.isConfigured(), start: startDatadogPolling },
    { configured: posthogAdapter.isConfigured(), start: startPostHogPolling },
    { configured: segmentAdapter.isConfigured(), start: startSegmentPolling },
  ];
  const activeStarters = pollingStarters.filter((s) => s.configured);
  const staggerMs = activeStarters.length > 1 ? 2000 : 0;
  activeStarters.forEach((s, i) => {
    setTimeout(() => s.start().catch((err: any) => console.error('[vitals] Polling start error:', err)), i * staggerMs);
  });
});

app.on('will-quit', () => {
  stopPolling();
  stopVercelPolling();
  stopSentryPolling();
  stopOpenAIPolling();
  stopAnthropicPolling();
  stopDatadogPolling();
  stopPostHogPolling();
  stopSegmentPolling();
  stopChrome();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Do nothing — keep app alive
});
