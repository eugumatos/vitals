import type {
  HoverData,
  ConnectorConfig,
} from './types';

export const emptyHoverData: HoverData = {
  errorRate: { value: '—', trend: 'stable' },
  conversion: { value: '—', trend: 'stable' },
  eventsPerMin: { value: '—', trend: 'stable' },
  vercel: null,
  sentry: null,
  github: {
    prs: [],
    actions: [],
    commits: [],
    notifications: 0,
  },
};

export const mockConnectors: ConnectorConfig[] = [
  { id: 'github', name: 'github', connected: false, icon: 'G' },
  { id: 'vercel', name: 'vercel', connected: false, icon: 'V' },
  { id: 'sentry', name: 'sentry', connected: false, icon: 'S' },
  { id: 'posthog', name: 'posthog', connected: false, icon: 'P' },
  { id: 'segment', name: 'segment', connected: false, icon: 'Se' },
];
