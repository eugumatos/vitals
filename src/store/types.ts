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
  source: 'vercel' | 'sentry' | 'github' | 'segment';
  label: string;
  detail: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface ServiceSnapshotData {
  data: any;
  timestamp: string;
}

export interface HoverData {
  errorRate: { value: string; trend: 'up' | 'down' | 'stable' };
  conversion: { value: string; trend: 'up' | 'down' | 'stable' };
  eventsPerMin: { value: string; trend: 'up' | 'down' | 'stable' };
  vercel: VercelData | null;
  sentry: SentryData | null;
  openai: ServiceSnapshotData | null;
  anthropic: ServiceSnapshotData | null;
  datadog: ServiceSnapshotData | null;
  supabase: ServiceSnapshotData | null;
  system: ServiceSnapshotData | null;
  github: {
    prs: Array<{
      number: number;
      title: string;
      author: string;
      isAuthor: boolean;
      isReviewRequested: boolean;
      branch: string;
      repo: string;
      repoFullName: string;
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
    notifications: Array<{
      id: string;
      title: string;
      reason: string;
      type: string;
      repo: string;
      repoFullName: string;
      url: string;
      unread: boolean;
      updatedAt: string;
    }>;
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
  // HTTP request metadata (when available from proxy events)
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
  requestId?: string;
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

export interface AIUsageData {
  usage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalRequests: number;
    totalCost: number;
    byModel: Array<{
      model: string;
      inputTokens: number;
      outputTokens: number;
      requests: number;
    }>;
  };
  periodStart: string;
  periodEnd: string;
}

export interface ConnectorConfig {
  id: string;
  name: string;
  connected: boolean;
  icon: string;
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  todayCount: number;
  isActiveToday: boolean;
  lastDeployAt: string | null;
}

export type NotificationKind = 'deploy' | 'anomaly' | 'action' | 'error';

export interface VitalsNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  /** Which service(s) triggered this */
  sources: string[];
  /** Navigate to this integration when clicked */
  targetIntegration?: string;
  /** Navigate to this state when clicked */
  targetState?: VitalsState;
  /** Associated anomaly id, if any */
  anomalyId?: string;
  timestamp: string;
  read: boolean;
}
