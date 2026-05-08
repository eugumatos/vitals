export type VitalsState =
  | 'resting'
  | 'hover'
  | 'anomaly'
  | 'incident'
  | 'deploy_verified'
  | 'onboarding'
  | 'settings';

export interface DeployInfo {
  sha: string;
  message: string;
  project: string;
  timestamp: string;
  status: 'building' | 'ready' | 'error';
  duration: string;
}

export interface ErrorInfo {
  title: string;
  count: number;
  trend: 'up' | 'down' | 'stable';
  firstSeen: string;
}

export interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  metric: string;
  metricLabel: string;
}

export interface AnomalyEvent {
  id: string;
  severity: 'warning' | 'critical';
  narrative: string;
  timeline: TimelineEntry[];
  detectedAt: string;
}

export interface TimelineEntry {
  source: 'vercel' | 'sentry' | 'github' | 'posthog' | 'segment';
  label: string;
  detail: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface HoverData {
  errorRate: { value: string; trend: 'up' | 'down' | 'stable' };
  conversion: { value: string; trend: 'up' | 'down' | 'stable' };
  eventsPerMin: { value: string; trend: 'up' | 'down' | 'stable' };
  vercel: VercelData | null;
  sentry: SentryData | null;
  github: {
    prs: Array<{
      number: number;
      title: string;
      author: string;
      branch: string;
      repo: string;
      status: 'needs_review' | 'approved' | 'changes_requested' | 'draft';
    }>;
    actions: Array<{
      name: string;
      sha: string;
      fullSha: string;
      branch: string;
      repo: string;
      repoFullName: string;
      conclusion: string | null;
      status: string;
      updatedAt: string;
    }>;
    commits: Array<{
      sha: string;
      fullSha: string;
      message: string;
      author: string;
      branch: string;
      repo: string;
      repoFullName: string;
      date: string;
    }>;
    notifications: number;
  };
}

export interface IncidentData {
  title: string;
  narrative: string;
  timeline: TimelineEntry[];
  deploy: DeployInfo;
  errorRate: string;
  errorRateBaseline: string;
  startedAt: string;
  actionLabel: string;
}

export interface VercelLogLine {
  text: string;
  type: 'error' | 'warning' | 'info';
  timestamp: string;
}

export interface VercelProjectLogs {
  runtime: VercelLogLine[];
  build: VercelLogLine[];
}

export interface VercelData {
  logsPerProject?: Record<string, VercelProjectLogs>;
  deployments: Array<{
    uid: string;
    project: string;
    url: string;
    state: string;
    sha: string;
    message: string;
    branch: string;
    author: string;
    target: string;
    createdAt: string;
    readyAt: string | null;
    duration: number | null;
    inspectorUrl: string;
    runtimeLogs?: VercelLogLine[];
  }>;
  projects: Array<{
    id: string;
    name: string;
    latestDeployState: string;
  }>;
}

export interface SentryData {
  issues: Array<{
    id: string;
    title: string;
    culprit: string;
    level: string;
    count: number;
    firstSeen: string;
    lastSeen: string;
    isUnhandled: boolean;
    shortId: string;
    project: string;
    permalink: string;
    isNew: boolean;
  }>;
  stats: {
    totalErrors24h: number;
    unresolvedCount: number;
    newIssues24h: number;
  };
}

export interface ConnectorConfig {
  id: string;
  name: string;
  connected: boolean;
  icon: string;
}
