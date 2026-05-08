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

  // GitHub
  github: {
    startDeviceFlow: (clientId: string) => ipcRenderer.invoke('github:start-device-flow', clientId),
    cancelDeviceFlow: () => ipcRenderer.invoke('github:cancel-device-flow'),
    onDeviceFlowSuccess: (callback: () => void) => {
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
    onSnapshot: (callback: (snapshot: any) => void) => {
      ipcRenderer.on('sentry:snapshot', (_event, snapshot) => callback(snapshot));
    },
    onError: (callback: (error: string) => void) => {
      ipcRenderer.on('sentry:error', (_event, error) => callback(error));
    },
  },

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  // Screen geometry
  getScreenGeometry: () => ipcRenderer.invoke('screen:geometry'),

  // Preferences
  getPollingInterval: () => ipcRenderer.invoke('preferences:get-polling-interval'),
  setPollingInterval: (sec: number) => ipcRenderer.invoke('preferences:set-polling-interval', sec),

  // Connectors status
  getConnectorStatus: () => ipcRenderer.invoke('connectors:status'),

  // Force refresh
  forceRefresh: () => ipcRenderer.invoke('force-refresh'),
});
