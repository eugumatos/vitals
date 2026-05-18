import { useState } from 'react';
import { colors, fontSize, fonts, spacing } from '../../lib/design-tokens';
import { useVitalsStore } from '../../store/useVitalsStore';
import type { VercelData } from '../../store/types';
import {
  HoverPanel, StatusDot, DataRow, Tag, RowLabel, RowMeta,
  StatCell, BottomBar, FilterPills, formatTimeAgo,
} from './shared';

type EnvFilter = 'all' | 'production' | 'preview';

function stateColor(state: string): string {
  const s = state.toUpperCase();
  if (s === 'READY') return colors.healthy;
  if (s === 'ERROR' || s === 'CANCELED') return colors.incident;
  return colors.anomaly;
}

export function VercelHover({ data }: { data: VercelData }) {
  const tab = useVitalsStore((s) => s.activeTab) || 'deploys';
  const [envFilter, setEnvFilter] = useState<EnvFilter>('all');

  const filtered = envFilter === 'all'
    ? data.deployments
    : data.deployments.filter((d) => d.target === envFilter);

  const readyCount = data.deployments.filter((d) => d.state.toUpperCase() === 'READY').length;
  const errorCount = data.deployments.filter((d) => d.state.toUpperCase() === 'ERROR').length;
  const buildingCount = data.deployments.filter((d) => ['BUILDING', 'QUEUED'].includes(d.state.toUpperCase())).length;

  const envOptions: Array<{ label: string; value: EnvFilter }> = [
    { label: 'all', value: 'all' }, { label: 'prod', value: 'production' }, { label: 'preview', value: 'preview' },
  ];

  return (
    <HoverPanel>
      {tab === 'deploys' && (
        <div style={{ marginBottom: 6 }}>
          <FilterPills options={envOptions} active={envFilter} onChange={setEnvFilter} />
        </div>
      )}

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'deploys' && filtered.slice(0, 6).map((d, i) => {
          const sc = stateColor(d.state);
          const isPulse = ['BUILDING', 'QUEUED'].includes(d.state.toUpperCase());
          const link = d.inspectorUrl || d.url;
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
              <RowMeta>{formatTimeAgo(d.createdAt)}</RowMeta>
            </DataRow>
          );
        })}

        {tab === 'projects' && data.projects.map((p, i) => {
          const sc = stateColor(p.latestDeployState);
          return (
            <DataRow key={p.id} last={i === data.projects.length - 1}>
              <StatusDot color={sc} />
              <RowLabel>{p.name}</RowLabel>
              <RowMeta color={sc}>{p.latestDeployState.toLowerCase()}</RowMeta>
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
    </HoverPanel>
  );
}
