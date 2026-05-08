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
} from './adapters/sentry';
import { removeToken, getAllTokenStatus, getWatchedRepos, setWatchedRepos, getWatchedVercelProjects, setWatchedVercelProjects, getPollingInterval, setPollingInterval as setPollingIntervalStore } from './store';
import type { WatchedRepo } from './store';

// Vercel/Sentry polling
let vercelPollingInterval: ReturnType<typeof setTimeout> | null = null;
let sentryPollingInterval: ReturnType<typeof setTimeout> | null = null;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const isDev = process.env.NODE_ENV !== 'production';
const WINDOW_HEIGHT = 480;
const PROTOCOL = 'vitals';

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

  // Debug hotkeys
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

function setupIPC(): void {
  // Mouse events
  ipcMain.on('set-ignore-mouse-events', (_event, ignore: boolean) => {
    if (mainWindow) {
      if (ignore) {
        mainWindow.setIgnoreMouseEvents(true, { forward: true });
      } else {
        mainWindow.setIgnoreMouseEvents(false);
      }
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

  ipcMain.handle('sentry:get-snapshot', async () => {
    try {
      const snapshot = await sentryAdapter.fetchSnapshot();
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
    if (githubAdapter.isConfigured()) { stopPolling(); startGitHubPolling(); }
    if (vercelAdapter.isConfigured()) { stopVercelPolling(); startVercelPolling(); }
    if (sentryAdapter.isConfigured()) { stopSentryPolling(); startSentryPolling(); }
    return { success: true };
  });

  // Connector status
  ipcMain.handle('connectors:status', async () => {
    return await getAllTokenStatus();
  });

  // Force refresh all adapters
  ipcMain.handle('force-refresh', async () => {
    const results: string[] = [];
    if (githubAdapter.isConfigured()) {
      try {
        const snapshot = await githubAdapter.fetchSnapshot();
        if (mainWindow) mainWindow.webContents.send('github:snapshot', snapshot);
        results.push('github');
      } catch {}
    }
    if (vercelAdapter.isConfigured()) {
      try {
        const snapshot = await vercelAdapter.fetchSnapshot();
        if (mainWindow) mainWindow.webContents.send('vercel:snapshot', snapshot);
        results.push('vercel');
      } catch {}
    }
    if (sentryAdapter.isConfigured()) {
      try {
        const snapshot = await sentryAdapter.fetchSnapshot();
        if (mainWindow) mainWindow.webContents.send('sentry:snapshot', snapshot);
        results.push('sentry');
      } catch {}
    }
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
  await Promise.all([initGitHubAdapter(), initVercelAdapter(), initSentryAdapter()]);
  createWindow();
  createTray();
  registerShortcuts();

  if (githubAdapter.isConfigured()) startGitHubPolling();
  if (vercelAdapter.isConfigured()) startVercelPolling();
  if (sentryAdapter.isConfigured()) startSentryPolling();
});

app.on('will-quit', () => {
  stopPolling();
  stopVercelPolling();
  stopSentryPolling();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Do nothing — keep app alive
});
