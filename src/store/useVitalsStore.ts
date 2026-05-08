import { create } from 'zustand';
import type {
  VitalsState,
  HoverData,
  ConnectorConfig,
} from './types';
import {
  emptyHoverData,
  mockConnectors,
} from './mockData';

export interface DeviceFlowState {
  step: 'idle' | 'client_id' | 'waiting';
  clientId: string;
  userCode: string;
  error: string | null;
}

interface VitalsStore {
  state: VitalsState;
  previousState: VitalsState;
  hoverData: HoverData;
  connectors: ConnectorConfig[];
  restingMetric: { label: string; value: string };
  restingDeploy: { sha: string; time: string; status: 'success' | 'failure' | 'building'; repo: string; fullSha: string };
  lastPolledAt: Date | null;
  pollingIntervalSec: number;
  deviceFlow: DeviceFlowState;
  activeIntegration: string; // 'github' | 'vercel' | 'sentry' | etc.

  setState: (state: VitalsState) => void;
  setActiveIntegration: (id: string) => void;
  setHover: () => void;
  setResting: () => void;
  updateGitHubSnapshot: (data: any) => void;
  updateVercelSnapshot: (data: any) => void;
  updateSentrySnapshot: (data: any) => void;
  updateConnectorStatus: (status: Record<string, boolean>) => void;
  setConnectorConnected: (id: string, connected: boolean) => void;
  setDeviceFlow: (update: Partial<DeviceFlowState>) => void;
  resetDeviceFlow: () => void;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const useVitalsStore = create<VitalsStore>((set, get) => ({
  state: 'resting',
  previousState: 'resting',
  hoverData: emptyHoverData,
  connectors: mockConnectors,
  restingMetric: { label: '', value: '' },
  restingDeploy: { sha: '', time: '', status: 'success', repo: '', fullSha: '' },
  lastPolledAt: null,
  pollingIntervalSec: 30,
  deviceFlow: { step: 'idle', clientId: '', userCode: '', error: null },
  activeIntegration: 'github',

  setActiveIntegration: (id: string) => {
    set({ activeIntegration: id });
  },

  setState: (newState: VitalsState) => {
    const current = get().state;
    set({ state: newState, previousState: current });
  },

  setHover: () => {
    const current = get().state;
    const prev = get().previousState;
    if (current === 'resting') {
      // If user was in an expanded state before, restore it instead of going to hover
      if (prev !== 'resting' && prev !== 'hover') {
        set({ state: prev, previousState: 'resting' });
      } else {
        set({ state: 'hover', previousState: current });
      }
    }
  },

  setResting: () => {
    const current = get().state;
    if (current !== 'resting') {
      set({ state: 'resting', previousState: current });
    }
  },

  updateGitHubSnapshot: (data: any) => {
    if (!data) return;
    const { prs, actions, notifications } = data;
    const current = get().hoverData;

    const githubPrs = (prs?.items || []).slice(0, 5).map((pr: any) => ({
      number: pr.number,
      title: pr.title,
      author: pr.author,
      branch: pr.branch,
      repo: pr.repo || '',
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

    // Update resting deploy from latest action
    const latestRun = githubActions[0];
    const restingDeploy = latestRun
      ? {
          sha: latestRun.sha,
          fullSha: latestRun.fullSha,
          repo: latestRun.repoFullName || `${latestRun.repo}`,
          time: formatTimeAgo(latestRun.updatedAt).replace(' ago', '').replace('min', 'm').replace('just now', 'now'),
          status: (latestRun.conclusion === 'failure' ? 'failure' : latestRun.conclusion === 'success' ? 'success' : 'building') as 'success' | 'failure' | 'building',
        }
      : get().restingDeploy;

    const githubCommits = (data.commits || []).slice(0, 10).map((c: any) => ({
      sha: c.sha,
      fullSha: c.fullSha || c.sha,
      message: c.message,
      author: c.author,
      branch: c.branch,
      repo: c.repo || '',
      repoFullName: c.repoFullName || '',
      date: c.date,
    }));

    // If no actions, use latest commit for restingDeploy
    const latestCommit = githubCommits[0];
    const finalRestingDeploy = restingDeploy.fullSha.length > 7
      ? restingDeploy
      : latestCommit
        ? {
            sha: latestCommit.sha,
            fullSha: latestCommit.fullSha,
            repo: latestCommit.repoFullName,
            time: formatTimeAgo(latestCommit.date).replace(' ago', '').replace('min', 'm').replace('just now', 'now'),
            status: 'success' as const,
          }
        : get().restingDeploy;

    set({
      hoverData: {
        ...current,
        github: {
          prs: githubPrs,
          actions: githubActions,
          commits: githubCommits,
          notifications: notifications?.unreadCount || 0,
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

  updateConnectorStatus: (status: Record<string, boolean>) => {
    set((prev) => ({
      connectors: prev.connectors.map((c) => ({
        ...c,
        connected: status[c.id] ?? c.connected,
      })),
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
}));
