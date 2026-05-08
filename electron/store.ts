// electron-store is ESM, use dynamic import
let storeInstance: any = null;

export interface WatchedRepo {
  fullName: string; // e.g. "owner/repo"
  branches: string[]; // e.g. ["main", "develop"]
}

interface StoreSchema {
  tokens: {
    github?: string;
    vercel?: string;
    sentry?: string;
    posthog?: string;
    segment?: string;
  };
  github?: {
    clientId?: string;
    clientSecret?: string;
  };
  watchedRepos: WatchedRepo[];
  watchedVercelProjects: string[]; // project names to monitor
  preferences: {
    hotkey: string;
    smartSilence: boolean;
    launchAtLogin: boolean;
    pollingIntervalSec: number;
  };
}

async function getStore(): Promise<any> {
  if (storeInstance) return storeInstance;
  const ElectronStore = (await import('electron-store')).default;
  storeInstance = new ElectronStore({
    name: 'vitals-config',
    encryptionKey: 'vitals-v1-local-encryption',
    defaults: {
      tokens: {},
      watchedRepos: [],
      watchedVercelProjects: [],
      preferences: {
        hotkey: 'CommandOrControl+Shift+N',
        smartSilence: true,
        launchAtLogin: false,
        pollingIntervalSec: 30,
      },
    },
  });
  return storeInstance;
}

export async function getToken(service: keyof StoreSchema['tokens']): Promise<string | undefined> {
  const store = await getStore();
  return store.get(`tokens.${service}`) as string | undefined;
}

export async function setToken(service: keyof StoreSchema['tokens'], token: string): Promise<void> {
  const store = await getStore();
  store.set(`tokens.${service}`, token);
}

export async function removeToken(service: keyof StoreSchema['tokens']): Promise<void> {
  const store = await getStore();
  store.delete(`tokens.${service}`);
}

export async function getGitHubOAuthConfig(): Promise<{ clientId?: string; clientSecret?: string }> {
  const store = await getStore();
  return store.get('github') || {};
}

export async function setGitHubOAuthConfig(clientId: string, clientSecret: string): Promise<void> {
  const store = await getStore();
  store.set('github', { clientId, clientSecret });
}

export async function getAllTokenStatus(): Promise<Record<string, boolean>> {
  const store = await getStore();
  const tokens = store.get('tokens') as StoreSchema['tokens'];
  return {
    github: !!tokens?.github,
    vercel: !!tokens?.vercel,
    sentry: !!tokens?.sentry,
    posthog: !!tokens?.posthog,
    segment: !!tokens?.segment,
  };
}

export async function getWatchedRepos(): Promise<WatchedRepo[]> {
  const store = await getStore();
  return (store.get('watchedRepos') as WatchedRepo[]) || [];
}

export async function setWatchedRepos(repos: WatchedRepo[]): Promise<void> {
  const store = await getStore();
  store.set('watchedRepos', repos);
}

export async function getWatchedVercelProjects(): Promise<string[]> {
  const store = await getStore();
  return (store.get('watchedVercelProjects') as string[]) || [];
}

export async function setWatchedVercelProjects(projects: string[]): Promise<void> {
  const store = await getStore();
  store.set('watchedVercelProjects', projects);
}

export async function getPollingInterval(): Promise<number> {
  const store = await getStore();
  return (store.get('preferences.pollingIntervalSec') as number) || 30;
}

export async function setPollingInterval(sec: number): Promise<void> {
  const store = await getStore();
  store.set('preferences.pollingIntervalSec', sec);
}
