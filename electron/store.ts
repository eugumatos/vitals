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
    openai?: string;
    anthropic?: string;
    datadog?: string;
    chrome?: string;
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
    silenceStartHour: number;
    silenceEndHour: number;
    silenceWeekends: boolean;
    launchAtLogin: boolean;
    pollingIntervalSec: number;
    restingMode: 'carousel' | 'vitals' | 'fixed';
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
        smartSilence: false,
        silenceStartHour: 19,
        silenceEndHour: 8,
        silenceWeekends: true,
        launchAtLogin: false,
        pollingIntervalSec: 30,
        restingMode: 'carousel',
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
    openai: !!tokens?.openai,
    anthropic: !!tokens?.anthropic,
    datadog: !!tokens?.datadog,
    chrome: !!tokens?.chrome,
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

export async function getLaunchAtLogin(): Promise<boolean> {
  const store = await getStore();
  return (store.get('preferences.launchAtLogin') as boolean) ?? false;
}

export async function setLaunchAtLogin(enabled: boolean): Promise<void> {
  const store = await getStore();
  store.set('preferences.launchAtLogin', enabled);
}

export interface SmartSilenceConfig {
  enabled: boolean;
  startHour: number;
  endHour: number;
  weekends: boolean;
}

export async function getSmartSilence(): Promise<SmartSilenceConfig> {
  const store = await getStore();
  return {
    enabled: (store.get('preferences.smartSilence') as boolean) ?? false,
    startHour: (store.get('preferences.silenceStartHour') as number) ?? 19,
    endHour: (store.get('preferences.silenceEndHour') as number) ?? 8,
    weekends: (store.get('preferences.silenceWeekends') as boolean) ?? true,
  };
}

export async function setSmartSilence(config: SmartSilenceConfig): Promise<void> {
  const store = await getStore();
  store.set('preferences.smartSilence', config.enabled);
  store.set('preferences.silenceStartHour', config.startHour);
  store.set('preferences.silenceEndHour', config.endHour);
  store.set('preferences.silenceWeekends', config.weekends);
}

export function isInSilenceWindow(config: SmartSilenceConfig): boolean {
  if (!config.enabled) return false;
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  // Weekend check (0 = Sunday, 6 = Saturday)
  if (config.weekends && (day === 0 || day === 6)) return true;

  // Hour check — handles ranges that cross midnight (e.g., 19→8)
  if (config.startHour > config.endHour) {
    // e.g., 19:00 → 08:00: silent if hour >= 19 OR hour < 8
    return hour >= config.startHour || hour < config.endHour;
  }
  // e.g., 22:00 → 22:00 (same = disabled) or 8:00 → 19:00
  return hour >= config.startHour && hour < config.endHour;
}

export async function getRestingMode(): Promise<string> {
  const store = await getStore();
  return (store.get('preferences.restingMode') as string) || 'carousel';
}

export async function setRestingMode(mode: string): Promise<void> {
  const store = await getStore();
  store.set('preferences.restingMode', mode);
}
