import { useState, useMemo, useCallback } from 'react';
import { colors, fontSize, fonts, spacing } from '../../lib/design-tokens';
import { useVitalsStore } from '../../store/useVitalsStore';
import type { VercelData } from '../../store/types';
import {
  HoverPanel, StatusDot, DataRow, Tag, RowLabel, RowMeta,
  StatCell, BottomBar, FilterPills, MiniBar, formatTimeAgo,
} from './shared';

type EnvFilter = 'all' | 'production' | 'preview';

function stateColor(state: string): string {
  const s = state.toUpperCase();
  if (s === 'READY') return colors.healthy;
  if (s === 'ERROR' || s === 'CANCELED') return colors.incident;
  return colors.anomaly;
}

// --- Insights computation ---

interface DeployInsights {
  velocity: number;          // deploys this week
  velocityPrev: number;      // deploys prev week
  velocityChange: number;    // % change
  successRate: number;       // % READY
  avgBuildSec: number;       // average build duration in seconds
  avgBuildPrev: number;      // prev week avg build
  streak: number;            // consecutive READY from most recent
  mttrSec: number | null;    // mean time to recovery (seconds)
  totalDeploys: number;
}

function computeInsights(deployments: VercelData['deployments']): DeployInsights {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const weekAgo = now - weekMs;
  const twoWeeksAgo = now - weekMs * 2;

  const thisWeek = deployments.filter((d) => new Date(d.createdAt).getTime() > weekAgo);
  const prevWeek = deployments.filter((d) => {
    const t = new Date(d.createdAt).getTime();
    return t > twoWeeksAgo && t <= weekAgo;
  });

  // Velocity
  const velocity = thisWeek.length;
  const velocityPrev = prevWeek.length;
  const velocityChange = velocityPrev > 0
    ? Math.round(((velocity - velocityPrev) / velocityPrev) * 100)
    : 0;

  // Success rate (this week, or all if not enough)
  const pool = thisWeek.length >= 3 ? thisWeek : deployments;
  const readyCount = pool.filter((d) => d.state.toUpperCase() === 'READY').length;
  const successRate = pool.length > 0 ? Math.round((readyCount / pool.length) * 100) : 100;

  // Avg build time
  const withDuration = thisWeek.filter((d) => d.duration != null && d.duration > 0);
  const avgBuildSec = withDuration.length > 0
    ? Math.round(withDuration.reduce((s, d) => s + d.duration!, 0) / withDuration.length)
    : 0;
  const prevWithDuration = prevWeek.filter((d) => d.duration != null && d.duration > 0);
  const avgBuildPrev = prevWithDuration.length > 0
    ? Math.round(prevWithDuration.reduce((s, d) => s + d.duration!, 0) / prevWithDuration.length)
    : 0;

  // Streak — consecutive READY from most recent (deployments are newest first)
  let streak = 0;
  for (const d of deployments) {
    if (d.state.toUpperCase() === 'READY') streak++;
    else break;
  }

  // MTTR — for each ERROR, find the next READY in the same project (looking backward in time)
  let totalRecovery = 0;
  let recoveryCount = 0;
  for (let i = 0; i < deployments.length; i++) {
    const d = deployments[i];
    if (d.state.toUpperCase() !== 'ERROR') continue;
    // Find next READY for same project (earlier index = more recent)
    for (let j = i - 1; j >= 0; j--) {
      if (deployments[j].project === d.project && deployments[j].state.toUpperCase() === 'READY') {
        const errorTime = new Date(d.createdAt).getTime();
        const recoveryTime = new Date(deployments[j].createdAt).getTime();
        totalRecovery += (recoveryTime - errorTime) / 1000;
        recoveryCount++;
        break;
      }
    }
  }
  const mttrSec = recoveryCount > 0 ? Math.round(totalRecovery / recoveryCount) : null;

  return { velocity, velocityPrev, velocityChange, successRate, avgBuildSec, avgBuildPrev, streak, mttrSec, totalDeploys: deployments.length };
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function TrendArrow({ value, invert }: { value: number; invert?: boolean }) {
  if (value === 0) return <span style={{ color: colors.textTertiary, fontSize: 10 }}>—</span>;
  const isUp = value > 0;
  // For build time, up is bad (invert). For velocity/success, up is good.
  const isGood = invert ? !isUp : isUp;
  const color = isGood ? colors.healthy : colors.incident;
  const arrow = isUp ? '\u2191' : '\u2193';
  return (
    <span style={{ color, fontSize: 10, fontFamily: fonts.mono }}>
      {arrow}{Math.abs(value)}%
    </span>
  );
}

function InsightRow({ label, value, sub, trend, trendInvert }: {
  label: string; value: string; sub?: string; trend?: number; trendInvert?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 0',
      borderBottom: `0.5px solid ${colors.divider}`,
    }}>
      <span style={{ fontSize: fontSize.body, color: colors.textTertiary, width: 90, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: fontSize.bodyLarge, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums', fontFamily: fonts.mono }}>
        {value}
      </span>
      {trend != null && <TrendArrow value={trend} invert={trendInvert} />}
      {sub && <span style={{ fontSize: 10, color: colors.textTertiary, marginLeft: 'auto' }}>{sub}</span>}
    </div>
  );
}

function InsightsView({ deployments }: { deployments: VercelData['deployments'] }) {
  const insights = useMemo(() => computeInsights(deployments), [deployments]);

  const successColor = insights.successRate >= 90 ? colors.healthy
    : insights.successRate >= 70 ? colors.anomaly
    : colors.incident;

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <InsightRow
          label="velocity"
          value={`${insights.velocity}/wk`}
          trend={insights.velocityChange}
          sub={insights.velocityPrev > 0 ? `prev ${insights.velocityPrev}` : undefined}
        />
        <InsightRow
          label="success rate"
          value={`${insights.successRate}%`}
          sub={`${insights.totalDeploys} deploys`}
        />
        {insights.avgBuildSec > 0 && (
          <InsightRow
            label="avg build"
            value={formatDuration(insights.avgBuildSec)}
            trend={insights.avgBuildPrev > 0
              ? Math.round(((insights.avgBuildSec - insights.avgBuildPrev) / insights.avgBuildPrev) * 100)
              : undefined}
            trendInvert
            sub={insights.avgBuildPrev > 0 ? `prev ${formatDuration(insights.avgBuildPrev)}` : undefined}
          />
        )}
        {insights.mttrSec != null && (
          <InsightRow
            label="recovery"
            value={formatDuration(insights.mttrSec)}
            sub="avg error \u2192 ready"
          />
        )}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 0',
        }}>
          <span style={{ fontSize: fontSize.body, color: colors.textTertiary, width: 90, flexShrink: 0 }}>streak</span>
          <span style={{
            fontSize: fontSize.bodyLarge, fontFamily: fonts.mono,
            color: insights.streak >= 10 ? colors.healthy : insights.streak >= 5 ? colors.anomaly : colors.textPrimary,
          }}>
            {insights.streak}
          </span>
          <span style={{ fontSize: 10, color: colors.textTertiary }}>consecutive ready</span>
        </div>
      </div>

      <BottomBar>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
          <span style={{ fontSize: 10, color: colors.textTertiary }}>health</span>
          <MiniBar value={insights.successRate} max={100} color={successColor} />
          <span style={{ fontSize: 10, color: successColor, fontFamily: fonts.mono }}>{insights.successRate}%</span>
        </div>
      </BottomBar>
    </>
  );
}

// --- Action button ---

const actionBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: 'none',
  borderRadius: 4,
  padding: '1px 6px',
  fontSize: 9,
  fontFamily: fonts.mono,
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'background 0.15s, color 0.15s',
};

// Toast state shared across action buttons within VercelHover
let _toastSetter: ((t: { success: boolean; message: string } | null) => void) | null = null;

function showToast(success: boolean, message: string) {
  _toastSetter?.({ success, message });
  setTimeout(() => _toastSetter?.(null), 4000);
}

function VercelToast({ toast }: { toast: { success: boolean; message: string } | null }) {
  if (!toast) return null;
  return (
    <div style={{
      padding: '5px 10px',
      marginBottom: 6,
      borderRadius: 6,
      fontSize: 10,
      fontFamily: fonts.mono,
      color: toast.success ? colors.healthy : colors.incident,
      background: toast.success ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)',
      border: `0.5px solid ${toast.success ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}`,
      animation: 'vercel-toast-in 0.2s ease',
    }}>
      {toast.success ? '\u2713' : '\u2717'} {toast.message}
      <style>{`@keyframes vercel-toast-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: (e: React.MouseEvent) => Promise<any> }) {
  const [busy, setBusy] = useState(false);
  const handle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const result = await onClick(e);
      if (result?.success === false) {
        showToast(false, result.error || `${label} failed`);
      } else {
        showToast(true, `${label} triggered`);
      }
    } catch (err: any) {
      showToast(false, err?.message || `${label} failed`);
    }
    setBusy(false);
  }, [busy, onClick, label]);

  return (
    <button
      onClick={handle}
      disabled={busy}
      style={{ ...actionBtnStyle, color: busy ? colors.textTertiary : color }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
    >
      {busy ? '...' : label}
    </button>
  );
}

// --- Main component ---

export function VercelHover({ data }: { data: VercelData }) {
  const tab = useVitalsStore((s) => s.activeTab) || 'deploys';
  const activeVercelProject = useVitalsStore((s) => s.activeVercelProject);
  const [envFilter, setEnvFilter] = useState<EnvFilter>('all');
  const [toast, setToast] = useState<{ success: boolean; message: string } | null>(null);
  _toastSetter = setToast;

  const projectFiltered = activeVercelProject
    ? data.deployments.filter((d) => d.project === activeVercelProject)
    : data.deployments;

  const filtered = envFilter === 'all'
    ? projectFiltered
    : projectFiltered.filter((d) => d.target === envFilter);

  const readyCount = projectFiltered.filter((d) => d.state.toUpperCase() === 'READY').length;
  const errorCount = projectFiltered.filter((d) => d.state.toUpperCase() === 'ERROR').length;
  const buildingCount = projectFiltered.filter((d) => ['BUILDING', 'QUEUED'].includes(d.state.toUpperCase())).length;

  const envOptions: Array<{ label: string; value: EnvFilter }> = [
    { label: 'all', value: 'all' }, { label: 'prod', value: 'production' }, { label: 'preview', value: 'preview' },
  ];

  // Find the latest READY deploy per project for rollback
  const getLatestReady = useCallback((projectName: string, excludeUid: string) => {
    return data.deployments.find(
      (d) => d.project === projectName && d.state.toUpperCase() === 'READY' && d.uid !== excludeUid
    );
  }, [data.deployments]);

  // Look up project ID by name
  const getProjectId = useCallback((projectName: string) => {
    return data.projects.find((p) => p.name === projectName)?.id;
  }, [data.projects]);

  const handleRedeploy = useCallback(async (uid: string, projectName: string, target: string) => {
    const result = await window.vitals.vercel.redeploy(uid, projectName, target);
    window.vitals.forceRefresh();
    return result;
  }, []);

  const handleCancel = useCallback(async (uid: string) => {
    const result = await window.vitals.vercel.cancel(uid);
    window.vitals.forceRefresh();
    return result;
  }, []);

  const handleRollback = useCallback(async (projectName: string, latestReadyUid: string) => {
    const projectId = getProjectId(projectName);
    if (!projectId) return { success: false };
    const result = await window.vitals.vercel.rollback(projectId, latestReadyUid);
    window.vitals.forceRefresh();
    return result;
  }, [getProjectId]);

  return (
    <HoverPanel>
      <VercelToast toast={toast} />
      {tab === 'deploys' && (
        <>
          <div style={{ marginBottom: 6 }}>
            <FilterPills options={envOptions} active={envFilter} onChange={setEnvFilter} />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {filtered.slice(0, 6).map((d, i) => {
              const sc = stateColor(d.state);
              const st = d.state.toUpperCase();
              const isPulse = ['BUILDING', 'QUEUED'].includes(st);
              const link = d.inspectorUrl || d.url;
              const isBuilding = st === 'BUILDING' || st === 'QUEUED';
              const isError = st === 'ERROR';
              const isReady = st === 'READY';
              const latestReady = isError ? getLatestReady(d.project, d.uid) : null;

              return (
                <DataRow key={d.uid} last={i === Math.min(filtered.length, 6) - 1}
                  onClick={link ? () => window.vitals.openExternal(link.startsWith('http') ? link : `https://${link}`) : undefined}
                >
                  <StatusDot color={sc} pulse={isPulse} />
                  <RowLabel>{d.project}</RowLabel>
                  <RowMeta color={sc}>{d.state.toLowerCase()}</RowMeta>
                  {d.sha && <Tag>{d.sha}</Tag>}
                  <span style={{
                    fontSize: 10, padding: '1px 5px', borderRadius: 4, flexShrink: 0,
                    color: d.target === 'production' ? colors.healthy : colors.info,
                    background: d.target === 'production' ? 'rgba(52,211,153,0.12)' : 'rgba(96,165,250,0.12)',
                  }}>
                    {d.target === 'production' ? 'prod' : 'preview'}
                  </span>
                  {isBuilding && (
                    <ActionBtn label="cancel" color={colors.incident} onClick={() => handleCancel(d.uid)} />
                  )}
                  {isError && (
                    <ActionBtn label="redeploy" color={colors.anomaly} onClick={() => handleRedeploy(d.uid, d.project, d.target)} />
                  )}
                  {isError && latestReady && (
                    <ActionBtn label="rollback" color={colors.info} onClick={() => handleRollback(d.project, latestReady.uid)} />
                  )}
                  {isReady && d.target !== 'production' && (
                    <ActionBtn label="promote" color="#a78bfa" onClick={() => handleRollback(d.project, d.uid)} />
                  )}
                  {isReady && i === 0 && (
                    <ActionBtn label="redeploy" color={colors.textSecondary} onClick={() => handleRedeploy(d.uid, d.project, d.target)} />
                  )}
                  {!isBuilding && !isError && !(isReady && i === 0) && d.target === 'production' && (
                    <RowMeta>{formatTimeAgo(d.createdAt)}</RowMeta>
                  )}
                </DataRow>
              );
            })}
          </div>

          <BottomBar>
            <StatCell label="ready" value={String(readyCount)} color={colors.healthy} />
            {errorCount > 0 && <StatCell label="errors" value={String(errorCount)} color={colors.incident} />}
            {buildingCount > 0 && <StatCell label="building" value={String(buildingCount)} color={colors.anomaly} />}
            <StatCell label="projects" value={String(data.projects.length)} />
          </BottomBar>
        </>
      )}

      {tab === 'insights' && (
        <InsightsView deployments={projectFiltered} />
      )}
    </HoverPanel>
  );
}
