import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('vitals', {
  // State management
  onStateChange: (callback: (state: string) => void) => {
    ipcRenderer.on('state-change', (_event, state: string) => {
      callback(state);
    });
  },
  setIgnoreMouseEvents: (ignore: boolean) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore);
  },
  setWindowBounds: (bounds: { width: number; height: number }) => {
    ipcRenderer.send('set-window-bounds', bounds);
  },

  // GitHub
  github: {
    startDeviceFlow: (clientId: string) => ipcRenderer.invoke('github:start-device-flow', clientId),
    cancelDeviceFlow: () => ipcRenderer.invoke('github:cancel-device-flow'),
    onDeviceFlowSuccess: (callback: () => void) => {
      ipcRenderer.removeAllListeners('github:device-flow-success');
      ipcRenderer.on('github:device-flow-success', () => callback());
    },
    setToken: (token: string) => ipcRenderer.invoke('github:set-token', token),
    getSnapshot: () => ipcRenderer.invoke('github:get-snapshot'),
    isConfigured: () => ipcRenderer.invoke('github:is-configured'),
    disconnect: () => ipcRenderer.invoke('github:disconnect'),
    listRepos: () => ipcRenderer.invoke('github:list-repos'),
    listBranches: (repo: string) => ipcRenderer.invoke('github:list-branches', repo),
    getWatchedRepos: () => ipcRenderer.invoke('github:get-watched-repos'),
    setWatchedRepos: (repos: any[]) => ipcRenderer.invoke('github:set-watched-repos', repos),
    onSnapshot: (callback: (snapshot: any) => void) => {
      ipcRenderer.on('github:snapshot', (_event, snapshot) => {
        callback(snapshot);
      });
    },
    onError: (callback: (error: string) => void) => {
      ipcRenderer.on('github:error', (_event, error) => {
        callback(error);
      });
    },
  },

  // Vercel
  vercel: {
    setToken: (token: string) => ipcRenderer.invoke('vercel:set-token', token),
    startOAuth: (clientId: string, clientSecret: string) => ipcRenderer.invoke('vercel:start-oauth', clientId, clientSecret),
    cancelOAuth: () => ipcRenderer.invoke('vercel:cancel-oauth'),
    onOAuthSuccess: (callback: () => void) => {
      ipcRenderer.on('vercel:oauth-success', () => callback());
    },
    disconnect: () => ipcRenderer.invoke('vercel:disconnect'),
    getSnapshot: () => ipcRenderer.invoke('vercel:get-snapshot'),
    listProjects: () => ipcRenderer.invoke('vercel:list-projects'),
    getWatchedProjects: () => ipcRenderer.invoke('vercel:get-watched-projects'),
    setWatchedProjects: (projects: string[]) => ipcRenderer.invoke('vercel:set-watched-projects', projects),
    onSnapshot: (callback: (snapshot: any) => void) => {
      ipcRenderer.on('vercel:snapshot', (_event, snapshot) => callback(snapshot));
    },
    onError: (callback: (error: string) => void) => {
      ipcRenderer.on('vercel:error', (_event, error) => callback(error));
    },
  },

  // Sentry
  sentry: {
    setToken: (token: string) => ipcRenderer.invoke('sentry:set-token', token),
    disconnect: () => ipcRenderer.invoke('sentry:disconnect'),
    getSnapshot: () => ipcRenderer.invoke('sentry:get-snapshot'),
    listProjects: () => ipcRenderer.invoke('sentry:list-projects'),
    getWatchedProjects: () => ipcRenderer.invoke('sentry:get-watched-projects'),
    setWatchedProjects: (projects: string[]) => ipcRenderer.invoke('sentry:set-watched-projects', projects),
    onSnapshot: (callback: (snapshot: any) => void) => {
      ipcRenderer.on('sentry:snapshot', (_event, snapshot) => callback(snapshot));
    },
    onError: (callback: (error: string) => void) => {
      ipcRenderer.on('sentry:error', (_event, error) => callback(error));
    },
  },

  // OpenAI
  openai: {
    setToken: (token: string) => ipcRenderer.invoke('openai:set-token', token),
    disconnect: () => ipcRenderer.invoke('openai:disconnect'),
    getSnapshot: () => ipcRenderer.invoke('openai:get-snapshot'),
    onSnapshot: (callback: (snapshot: any) => void) => {
      ipcRenderer.on('openai:snapshot', (_event, snapshot) => callback(snapshot));
    },
    onError: (callback: (error: string) => void) => {
      ipcRenderer.on('openai:error', (_event, error) => callback(error));
    },
  },

  // Anthropic
  anthropic: {
    setToken: (token: string) => ipcRenderer.invoke('anthropic:set-token', token),
    disconnect: () => ipcRenderer.invoke('anthropic:disconnect'),
    getSnapshot: () => ipcRenderer.invoke('anthropic:get-snapshot'),
    onSnapshot: (callback: (snapshot: any) => void) => {
      ipcRenderer.on('anthropic:snapshot', (_event, snapshot) => callback(snapshot));
    },
    onError: (callback: (error: string) => void) => {
      ipcRenderer.on('anthropic:error', (_event, error) => callback(error));
    },
  },

  // Supabase
  supabase: {
    setToken: (token: string) => ipcRenderer.invoke('supabase:set-token', token),
    disconnect: () => ipcRenderer.invoke('supabase:disconnect'),
    getSnapshot: () => ipcRenderer.invoke('supabase:get-snapshot'),
    onSnapshot: (callback: (snapshot: any) => void) => {
      ipcRenderer.on('supabase:snapshot', (_event, snapshot) => callback(snapshot));
    },
    onError: (callback: (error: string) => void) => {
      ipcRenderer.on('supabase:error', (_event, error) => callback(error));
    },
  },

  // Datadog
  datadog: {
    setToken: (token: string) => ipcRenderer.invoke('datadog:set-token', token),
    disconnect: () => ipcRenderer.invoke('datadog:disconnect'),
    getSnapshot: () => ipcRenderer.invoke('datadog:get-snapshot'),
    onSnapshot: (callback: (snapshot: any) => void) => {
      ipcRenderer.on('datadog:snapshot', (_event, snapshot) => callback(snapshot));
    },
    onError: (callback: (error: string) => void) => {
      ipcRenderer.on('datadog:error', (_event, error) => callback(error));
    },
  },

  // Deploy completed events
  onDeployCompleted: (callback: (data: { success: boolean; body: string }) => void) => {
    ipcRenderer.on('deploy:completed', (_event, data) => callback(data));
  },

  // Preferences changed from another window
  onPreferencesChanged: (callback: (changes: Record<string, any>) => void) => {
    ipcRenderer.on('preferences:changed', (_event, changes) => callback(changes));
  },

  // Anomaly detection events
  onAnomalyDetected: (callback: (event: any) => void) => {
    ipcRenderer.on('anomaly:detected', (_event, data) => callback(data));
  },

  // Notification events
  onNotificationPush: (callback: (notification: any) => void) => {
    ipcRenderer.on('notification:push', (_event, notification) => callback(notification));
  },

  onNotificationNavigate: (callback: (data: { integration?: string; state?: string; notificationId: string }) => void) => {
    ipcRenderer.on('notification:navigate', (_event, data) => callback(data));
  },

  // Data clear events (watched repos/projects changed)
  onDataClear: (callback: (service: string) => void) => {
    ipcRenderer.on('data:clear', (_event, service) => callback(service));
  },

  // Connector status changed (connect/disconnect from any window)
  onConnectorsChanged: (callback: (status: Record<string, boolean>) => void) => {
    ipcRenderer.on('connectors:changed', (_event, status) => callback(status));
  },

  onWatchedReposChanged: (callback: (repos: Array<{ fullName: string; branches: string[] }>) => void) => {
    ipcRenderer.on('watched-repos:changed', (_event, repos) => callback(repos));
  },

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  // Screen geometry
  getScreenGeometry: () => ipcRenderer.invoke('screen:geometry'),

  // Preferences
  getPollingInterval: () => ipcRenderer.invoke('preferences:get-polling-interval'),
  setPollingInterval: (sec: number) => ipcRenderer.invoke('preferences:set-polling-interval', sec),
  getRestingMode: () => ipcRenderer.invoke('preferences:get-resting-mode') as Promise<string>,
  setRestingMode: (mode: string) => ipcRenderer.invoke('preferences:set-resting-mode', mode),
  getLaunchAtLogin: () => ipcRenderer.invoke('preferences:get-launch-at-login') as Promise<boolean>,
  setLaunchAtLogin: (enabled: boolean) => ipcRenderer.invoke('preferences:set-launch-at-login', enabled),
  getSmartSilence: () => ipcRenderer.invoke('preferences:get-smart-silence') as Promise<{ enabled: boolean; startHour: number; endHour: number; weekends: boolean }>,
  setSmartSilence: (config: { enabled: boolean; startHour: number; endHour: number; weekends: boolean }) => ipcRenderer.invoke('preferences:set-smart-silence', config),
  isSilenced: () => ipcRenderer.invoke('preferences:is-silenced') as Promise<boolean>,

  // Connectors status
  getConnectorStatus: () => ipcRenderer.invoke('connectors:status'),

  // Force refresh
  forceRefresh: () => ipcRenderer.invoke('force-refresh'),

  // Open settings window
  openSettings: () => ipcRenderer.invoke('open-settings'),

  // License
  license: {
    activate: (key: string) => ipcRenderer.invoke('license:activate', key),
    getStatus: () => ipcRenderer.invoke('license:status'),
    deactivate: () => ipcRenderer.invoke('license:deactivate'),
  },

  // Streaks
  streaks: {
    get: () => ipcRenderer.invoke('streaks:get'),
    onUpdated: (callback: (data: any) => void) => {
      ipcRenderer.on('streaks:updated', (_event, data) => callback(data));
    },
  },

  // Quit app
  quit: () => ipcRenderer.invoke('app:quit'),
});
