import { create } from 'zustand';
import type {
  VitalsState,
  HoverData,
  ConnectorConfig,
  AnomalyEvent,
  VitalsNotification,
  StreakData,
} from './types';
import {
  emptyHoverData,
  mockConnectors,
} from './mockData';
import { formatTimeAgoLong } from '../lib/utils';

export interface DeviceFlowState {
  step: 'idle' | 'client_id' | 'waiting';
  clientId: string;
  userCode: string;
  error: string | null;
}

interface VitalsStore {
  state: VitalsState;
  previousState: VitalsState;
  /** State to restore on next mouseenter — written once on mouseleave, read once on mouseenter */
  returnState: VitalsState | null;
  hoverData: HoverData;
  connectors: ConnectorConfig[];
  restingMetric: { label: string; value: string };
  restingDeploy: { sha: string; time: string; status: 'success' | 'failure' | 'building'; repo: string; fullSha: string };
  lastPolledAt: Date | null;
  pollingIntervalSec: number;
  deviceFlow: DeviceFlowState;
  activeIntegration: string;
  activeTab: string;
  activeRepo: string;
  watchedRepos: Array<{ fullName: string; branches: string[] }>;
  serviceErrors: Record<string, string | null>;
  connectorsLoaded: boolean;
  restingMode: 'pulse' | 'glance';
  isSilenced: boolean;
  deployFlash: { active: boolean; success: boolean; message: string } | null;
  activeAnomalies: AnomalyEvent[];
  notifications: VitalsNotification[];
  unreadCount: number;
  showWelcome: boolean;

  setState: (state: VitalsState) => void;
  setActiveIntegration: (id: string) => void;
  setActiveTab: (tab: string) => void;
  setActiveRepo: (repo: string) => void;
  setWatchedRepos: (repos: Array<{ fullName: string; branches: string[] }>) => void;
  setHover: () => void;
  setResting: () => void;
  updateGitHubSnapshot: (data: any) => void;
  updateVercelSnapshot: (data: any) => void;
  updateSentrySnapshot: (data: any) => void;
  updateServiceSnapshot: (service: string, data: any) => void;
  setServiceError: (service: string, error: string | null) => void;
  clearErrors: () => void;
  updateConnectorStatus: (status: Record<string, boolean>) => void;
  setConnectorConnected: (id: string, connected: boolean) => void;
  setDeviceFlow: (update: Partial<DeviceFlowState>) => void;
  resetDeviceFlow: () => void;
  clearServiceData: (service: string) => void;
  addAnomaly: (event: AnomalyEvent) => void;
  dismissAnomaly: (id: string) => void;
  pushNotification: (notification: VitalsNotification) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  streakData: StreakData | null;
  updateStreakData: (data: StreakData) => void;
  dismissWelcome: () => void;
}

export const useVitalsStore = create<VitalsStore>((set, get) => ({
  state: 'resting',
  previousState: 'resting',
  returnState: null,
  hoverData: emptyHoverData,
  connectors: mockConnectors,
  restingMetric: { label: '', value: '' },
  restingDeploy: { sha: '', time: '', status: 'success', repo: '', fullSha: '' },
  lastPolledAt: null,
  pollingIntervalSec: 30,
  deviceFlow: { step: 'idle', clientId: '', userCode: '', error: null },
  activeIntegration: 'github',
  activeTab: '',
  activeRepo: '',
  watchedRepos: [],
  serviceErrors: {},
  connectorsLoaded: false,
  restingMode: 'pulse',
  isSilenced: false,
  deployFlash: null,
  activeAnomalies: [],
  notifications: [],
  unreadCount: 0,
  showWelcome: true,
  streakData: null,

  setActiveIntegration: (id: string) => {
    set({ activeIntegration: id, activeTab: '', activeRepo: '' }); // reset tab and repo when switching integration
  },

  setActiveTab: (tab: string) => {
    set({ activeTab: tab });
  },

  setActiveRepo: (repo: string) => {
    set({ activeRepo: repo });
  },

  setWatchedRepos: (repos: Array<{ fullName: string; branches: string[] }>) => {
    set({ watchedRepos: repos });
  },

  setState: (newState: VitalsState) => {
    const current = get().state;
    set({ state: newState, previousState: current });
  },

  setHover: () => {
    const current = get().state;
    if (current !== 'resting') return;

    const hasAnyConnected = get().connectors.some((c) => c.connected);
    // Also check if we already have real data (snapshots may arrive before connector status)
    const hd = get().hoverData;
    const hasData = (hd.github.prs.length + hd.github.actions.length + hd.github.notifications.length) > 0
      || hd.vercel != null || hd.sentry != null || hd.openai != null
      || hd.anthropic != null || hd.datadog != null
      || hd.supabase != null;

    // Only show onboarding if connectors have been loaded and none are connected
    if (get().connectorsLoaded && !hasAnyConnected && !hasData) {
      set({ state: 'onboarding', previousState: 'resting', returnState: null });
      return;
    }

    // Restore the state the user was in before collapsing
    const restore = get().returnState;
    if (restore && restore !== 'resting' && restore !== 'hover') {
      set({ state: restore, previousState: 'resting', returnState: null });
    } else {
      set({ state: 'hover', previousState: 'resting', returnState: null });
    }
  },

  setResting: () => {
    const current = get().state;
    if (current === 'resting') return;
    // Only capture returnState on the first collapse — ignore bouncing events during CSS transition
    const existingReturn = get().returnState;
    set({
      state: 'resting',
      previousState: current,
      returnState: existingReturn ?? current,
    });
  },

  updateGitHubSnapshot: (data: any) => {
    if (!data) return;
    const { prs, actions, notifications } = data;
    const current = get().hoverData;

    const githubPrs = (prs?.items || []).slice(0, 10).map((pr: any) => ({
      number: pr.number,
      title: pr.title,
      author: pr.author,
      isAuthor: pr.isAuthor || false,
      isReviewRequested: pr.isReviewRequested || false,
      branch: pr.branch,
      repo: pr.repo || '',
      repoFullName: pr.repoFullName || '',
      status: pr.status,
    }));

    const githubActions = (actions?.recentRuns || []).slice(0, 5).map((run: any) => ({
      name: run.name,
      sha: run.sha,
      fullSha: run.fullSha || run.sha,
      branch: run.branch,
      repo: run.repo || '',
      repoFullName: run.repoFullName || '',
      conclusion: run.conclusion,
      status: run.status,
      updatedAt: run.updatedAt,
    }));

    const githubNotifications = (notifications?.items || []).slice(0, 15).map((n: any) => ({
      id: n.id,
      title: n.title,
      reason: n.reason || 'subscribed',
      type: n.type || 'Unknown',
      repo: n.repo || '',
      repoFullName: n.repoFullName || '',
      url: n.url || '',
      unread: n.unread || false,
      updatedAt: n.updatedAt || '',
    }));

    // Update resting deploy from latest action
    const latestRun = githubActions[0];
    const emptyDeploy: { sha: string; time: string; status: 'success' | 'failure' | 'building'; repo: string; fullSha: string } = { sha: '', time: '', status: 'success', repo: '', fullSha: '' };
    let finalRestingDeploy: typeof emptyDeploy;
    if (latestRun) {
      finalRestingDeploy = {
        sha: latestRun.sha,
        fullSha: latestRun.fullSha,
        repo: latestRun.repoFullName || `${latestRun.repo}`,
        time: formatTimeAgoLong(latestRun.updatedAt).replace(' ago', '').replace('min', 'm').replace('just now', 'now'),
        status: (latestRun.conclusion === 'failure' ? 'failure' : latestRun.conclusion === 'success' ? 'success' : 'building') as 'success' | 'failure' | 'building',
      };
    } else {
      finalRestingDeploy = emptyDeploy;
    }

    set({
      hoverData: {
        ...current,
        github: {
          prs: githubPrs,
          actions: githubActions,
          notifications: githubNotifications,
        },
      },
      restingDeploy: finalRestingDeploy,
      lastPolledAt: new Date(),
    });
  },

  updateVercelSnapshot: (data: any) => {
    if (!data) return;
    const current = get().hoverData;
    set({
      hoverData: { ...current, vercel: data },
      lastPolledAt: new Date(),
    });
  },

  updateSentrySnapshot: (data: any) => {
    if (!data) return;
    const current = get().hoverData;

    // Update error rate from Sentry stats
    const stats = data.stats;
    const errorRate = stats?.totalErrors24h != null
      ? { value: stats.totalErrors24h > 1000 ? `${(stats.totalErrors24h / 1000).toFixed(1)}k` : String(stats.totalErrors24h), trend: 'stable' as const }
      : get().hoverData.errorRate;

    set({
      hoverData: { ...current, sentry: data, errorRate },
      lastPolledAt: new Date(),
    });
  },

  updateServiceSnapshot: (service: string, data: any) => {
    if (!data) return;
    const current = get().hoverData;
    const validServices = ['openai', 'anthropic', 'datadog', 'supabase'] as const;
    if (!validServices.includes(service as any)) return;
    set({
      hoverData: {
        ...current,
        [service]: { data, timestamp: new Date().toISOString() },
      },
      lastPolledAt: new Date(),
      serviceErrors: { ...get().serviceErrors, [service]: null },
    });
  },

  setServiceError: (service: string, error: string | null) => {
    set((prev) => ({
      serviceErrors: { ...prev.serviceErrors, [service]: error },
    }));
  },

  clearErrors: () => {
    set({ serviceErrors: {} });
  },

  updateConnectorStatus: (status: Record<string, boolean>) => {
    const hasAny = Object.values(status).some(Boolean);
    set((prev) => ({
      connectors: prev.connectors.map((c) => ({
        ...c,
        connected: status[c.id] ?? c.connected,
      })),
      connectorsLoaded: true,
      showWelcome: hasAny ? false : prev.showWelcome,
    }));
  },

  setConnectorConnected: (id: string, connected: boolean) => {
    set((prev) => ({
      connectors: prev.connectors.map((c) =>
        c.id === id ? { ...c, connected } : c
      ),
    }));
  },

  setDeviceFlow: (update: Partial<DeviceFlowState>) => {
    set((prev) => ({ deviceFlow: { ...prev.deviceFlow, ...update } }));
  },

  resetDeviceFlow: () => {
    set({ deviceFlow: { step: 'idle', clientId: '', userCode: '', error: null } });
  },

  clearServiceData: (service: string) => {
    const current = get().hoverData;
    const update: Record<string, any> = {};
    if (service === 'github') {
      update.hoverData = { ...current, github: { prs: [], actions: [], notifications: [] } };
      update.restingDeploy = { sha: '', time: '', status: 'success', repo: '', fullSha: '' };
    } else if (service === 'vercel') {
      update.hoverData = { ...current, vercel: null };
    } else if (service === 'sentry') {
      update.hoverData = { ...current, sentry: null };
    } else {
      update.hoverData = { ...current, [service]: null };
    }
    set(update);
  },

  addAnomaly: (event: AnomalyEvent) => {
    set((prev) => {
      // Replace if same id exists, otherwise append (max 10)
      const filtered = prev.activeAnomalies.filter((a) => a.id !== event.id);
      return { activeAnomalies: [...filtered, event].slice(-10) };
    });
  },

  dismissAnomaly: (id: string) => {
    set((prev) => ({
      activeAnomalies: prev.activeAnomalies.filter((a) => a.id !== id),
    }));
  },

  pushNotification: (notification: VitalsNotification) => {
    set((prev) => {
      const updated = [...prev.notifications, notification].slice(-50); // keep last 50
      return {
        notifications: updated,
        unreadCount: prev.unreadCount + (notification.read ? 0 : 1),
      };
    });
  },

  markNotificationRead: (id: string) => {
    set((prev) => {
      let delta = 0;
      const updated = prev.notifications.map((n) => {
        if (n.id === id && !n.read) {
          delta++;
          return { ...n, read: true };
        }
        return n;
      });
      return { notifications: updated, unreadCount: Math.max(0, prev.unreadCount - delta) };
    });
  },

  markAllNotificationsRead: () => {
    set((prev) => ({
      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  clearNotifications: () => {
    set({ notifications: [], unreadCount: 0 });
  },

  updateStreakData: (data: StreakData) => {
    set({ streakData: data });
  },

  dismissWelcome: () => {
    set({ showWelcome: false });
  },
}));
