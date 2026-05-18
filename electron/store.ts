// electron-store is ESM, use dynamic import
let storeInstance: any = null;

import { getSecureToken, setSecureToken, removeSecureToken, getAllSecureTokenStatus } from './secure-store';

export interface WatchedRepo {
  fullName: string; // e.g. "owner/repo"
  branches: string[]; // e.g. ["main", "develop"]
}

type ServiceKey = 'github' | 'vercel' | 'sentry' | 'openai' | 'anthropic' | 'datadog' | 'supabase' | 'chrome';

interface StoreSchema {
  github?: {
    clientId?: string;
    clientSecret?: string;
  };
  watchedRepos: WatchedRepo[];
  watchedVercelProjects: string[]; // project names to monitor
  watchedSentryProjects: string[]; // sentry project slugs to monitor
  preferences: {
    hotkey: string;
    smartSilence: boolean;
    silenceStartHour: number;
    silenceEndHour: number;
    silenceWeekends: boolean;
    launchAtLogin: boolean;
    pollingIntervalSec: number;
    restingMode: 'pulse' | 'glance';
  };
  license: {
    key?: string;
    instanceId?: string;
    lastValidatedAt?: number;
    machineId?: string;
  };
}

async function getStore(): Promise<any> {
  if (storeInstance) return storeInstance;
  const ElectronStore = (await import('electron-store')).default;
  storeInstance = new ElectronStore({
    name: 'vitals-config',
    encryptionKey: 'vitals-v1-local-encryption',
    defaults: {
      watchedRepos: [],
      watchedVercelProjects: [],
      watchedSentryProjects: [],
      license: {},
      preferences: {
        hotkey: 'CommandOrControl+Shift+N',
        smartSilence: false,
        silenceStartHour: 19,
        silenceEndHour: 8,
        silenceWeekends: true,
        launchAtLogin: false,
        pollingIntervalSec: 30,
        restingMode: 'pulse',
      },
    },
  });
  return storeInstance;
}

// Token access now uses safeStorage (Keychain-backed)
export async function getToken(service: ServiceKey): Promise<string | undefined> {
  return getSecureToken(service);
}

export async function setToken(service: ServiceKey, token: string): Promise<void> {
  setSecureToken(service, token);
}

export async function removeToken(service: ServiceKey): Promise<void> {
  removeSecureToken(service);
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
  return getAllSecureTokenStatus();
}

export async function getWatchedRepos(): Promise<WatchedRepo[]> {
  const store = await getStore();
  return (store.get('watchedRepos') as WatchedRepo[]) || [];
}

export const MAX_WATCHED_REPOS = 5;

export async function setWatchedRepos(repos: WatchedRepo[]): Promise<void> {
  const store = await getStore();
  store.set('watchedRepos', repos.slice(0, MAX_WATCHED_REPOS));
}

export async function getWatchedVercelProjects(): Promise<string[]> {
  const store = await getStore();
  return (store.get('watchedVercelProjects') as string[]) || [];
}

export async function setWatchedVercelProjects(projects: string[]): Promise<void> {
  const store = await getStore();
  store.set('watchedVercelProjects', projects);
}

export async function getWatchedSentryProjects(): Promise<string[]> {
  const store = await getStore();
  return (store.get('watchedSentryProjects') as string[]) || [];
}

export async function setWatchedSentryProjects(projects: string[]): Promise<void> {
  const store = await getStore();
  store.set('watchedSentryProjects', projects);
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
  const raw = (store.get('preferences.restingMode') as string) || 'pulse';
  // Migrate old values
  if (raw === 'carousel' || raw === 'glance') return 'glance';
  if (raw === 'vitals' || raw === 'fixed') return 'pulse';
  return raw;
}

export async function setRestingMode(mode: string): Promise<void> {
  const store = await getStore();
  store.set('preferences.restingMode', mode);
}

export async function getLicense(): Promise<{ key?: string; instanceId?: string; lastValidatedAt?: number; machineId?: string }> {
  const store = await getStore();
  return (store.get('license') as StoreSchema['license']) || {};
}

export async function setLicense(data: { key?: string; instanceId?: string; lastValidatedAt?: number; machineId?: string }): Promise<void> {
  const store = await getStore();
  store.set('license', data);
}

export async function clearLicense(): Promise<void> {
  const store = await getStore();
  store.set('license', {});
}
