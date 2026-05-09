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
  openai: null,
  anthropic: null,
  datadog: null,
  posthog: null,
  segment: null,
  chrome: null,
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
  { id: 'openai', name: 'openai', connected: false, icon: 'OA' },
  { id: 'anthropic', name: 'anthropic', connected: false, icon: 'An' },
  { id: 'datadog', name: 'datadog', connected: false, icon: 'DD' },
  { id: 'chrome', name: 'chrome', connected: false, icon: 'Ch' },
];
