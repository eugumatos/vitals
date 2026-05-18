import { colors, fontSize, fonts } from '../../lib/design-tokens';
import { useVitalsStore } from '../../store/useVitalsStore';
import type { HoverData } from '../../store/types';
import {
  HoverPanel, StatusDot, Tag, Badge, DataRow, RowLabel, RowMeta,
  StatCell, BottomBar, formatTimeAgo,
} from './shared';

function prDotColor(status: string): string {
  if (status === 'approved') return colors.healthy;
  if (status === 'needs_review') return colors.anomaly;
  if (status === 'changes_requested') return colors.incident;
  return colors.textTertiary;
}

function actionDotColor(conclusion: string | null, status: string): string {
  if (status === 'in_progress') return colors.anomaly;
  if (conclusion === 'success') return colors.healthy;
  if (conclusion === 'failure') return colors.incident;
  return colors.textTertiary;
}

const reasonLabels: Record<string, string> = {
  review_requested: 'review requested',
  mention: 'mentioned',
  assign: 'assigned',
  ci_activity: 'CI',
  approval_requested: 'approval',
  subscribed: 'subscribed',
  comment: 'comment',
  author: 'author',
  state_change: 'state change',
  team_mention: 'team mention',
  security_alert: 'security',
  manual: 'manual',
};

const reasonColor: Record<string, string> = {
  review_requested: colors.anomaly,
  mention: colors.info,
  assign: colors.info,
  ci_activity: colors.textTertiary,
  approval_requested: colors.healthy,
  security_alert: colors.incident,
};

function notificationDotColor(reason: string, unread: boolean): string {
  if (!unread) return colors.textTertiary;
  return reasonColor[reason] || colors.info;
}

export function GitHubHover({ data }: { data: HoverData['github'] }) {
  const tab = useVitalsStore((s) => s.activeTab) || 'prs';
  const activeRepo = useVitalsStore((s) => s.activeRepo);

  // Filter by active repo when set (activeRepo is fullName like "owner/repo")
  const repoShort = activeRepo ? activeRepo.split('/').pop() || '' : '';
  const prs = activeRepo ? data.prs.filter((p) => p.repo === repoShort) : data.prs;
  const actions = activeRepo ? data.actions.filter((a) => a.repo === repoShort || a.repoFullName === activeRepo) : data.actions;
  const notifications = activeRepo ? data.notifications.filter((n) => n.repoFullName === activeRepo || n.repo === repoShort) : data.notifications;

  const failedRuns = actions.filter((a) => a.conclusion === 'failure').length;
  const reviewRequests = prs.filter((p) => p.isReviewRequested).length;
  const unreadNotifs = notifications.filter((n) => n.unread).length;

  return (
    <HoverPanel>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {tab === 'prs' && (
          prs.length > 0 ? prs.map((pr, i) => (
            <DataRow key={pr.number} last={i === prs.length - 1}
              onClick={() => window.vitals.openExternal(`https://github.com/${pr.repoFullName}/pull/${pr.number}`)}
            >
              <StatusDot color={prDotColor(pr.status)} />
              {pr.isReviewRequested && (
                <Badge color="#000" bg={colors.anomaly}>review</Badge>
              )}
              {pr.isAuthor && !pr.isReviewRequested && (
                <Badge color={colors.textPrimary} bg="rgba(255,255,255,0.08)">mine</Badge>
              )}
              <RowLabel>{pr.title}</RowLabel>
              <RowMeta color={colors.textTertiary}>{pr.repo}</RowMeta>
            </DataRow>
          )) : <Empty>No open pull requests</Empty>
        )}

        {tab === 'actions' && (
          actions.length > 0 ? actions.map((run, i) => (
            <DataRow key={`${run.fullSha}-${run.name}-${i}`} last={i === actions.length - 1}>
              <StatusDot color={actionDotColor(run.conclusion, run.status)} pulse={run.status === 'in_progress'} />
              <RowMeta color={colors.textTertiary}>{run.repo}</RowMeta>
              <RowLabel>{run.name}</RowLabel>
              <Tag>{run.sha}</Tag>
              <Tag>{run.branch}</Tag>
              <RowMeta>{formatTimeAgo(run.updatedAt)}</RowMeta>
            </DataRow>
          )) : <Empty>No recent runs</Empty>
        )}

        {tab === 'notifications' && (
          notifications.length > 0 ? notifications.map((n, i) => (
            <DataRow key={n.id} last={i === notifications.length - 1}
              onClick={() => n.url && window.vitals.openExternal(n.url)}
            >
              <StatusDot color={notificationDotColor(n.reason, n.unread)} />
              <Tag color={reasonColor[n.reason] || colors.textTertiary}>
                {reasonLabels[n.reason] || n.reason}
              </Tag>
              <RowLabel>{n.title}</RowLabel>
              <RowMeta>{formatTimeAgo(n.updatedAt)}</RowMeta>
            </DataRow>
          )) : <Empty>No notifications</Empty>
        )}
      </div>

      <BottomBar>
        <StatCell
          label="PRs"
          value={reviewRequests > 0 ? `${reviewRequests} to review` : `${prs.length}`}
          color={reviewRequests > 0 ? colors.anomaly : undefined}
        />
        <StatCell
          label="CI"
          value={failedRuns > 0 ? `${failedRuns} failed` : `${actions.filter((a) => a.conclusion === 'success').length} passed`}
          color={failedRuns > 0 ? colors.incident : colors.healthy}
        />
        <StatCell
          label="Inbox"
          value={unreadNotifs > 0 ? `${unreadNotifs} new` : `${notifications.length}`}
          color={unreadNotifs > 0 ? colors.info : undefined}
        />
      </BottomBar>
    </HoverPanel>
  );
}

function Empty({ children }: { children: string }) {
  return <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, padding: 8 }}>{children}</span>;
}
