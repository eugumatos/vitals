import { useState, useEffect, useCallback } from 'react';
import { useVitalsStore } from '../../store/useVitalsStore';
import { colors, fontSize, spacing, fonts } from '../../lib/design-tokens';

const POLLING_OPTIONS = [
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '2m', value: 120 },
  { label: '5m', value: 300 },
];

interface WatchedRepo {
  fullName: string;
  branches: string[];
}

interface RepoOption {
  fullName: string;
  defaultBranch: string;
}

export function Settings() {
  const { connectors, setConnectorConnected, deviceFlow, setDeviceFlow, resetDeviceFlow } = useVitalsStore();

  // Watched repos state (local — OK to lose on unmount)
  const [watchedRepos, setWatchedReposLocal] = useState<WatchedRepo[]>([]);
  const [availableRepos, setAvailableRepos] = useState<RepoOption[]>([]);
  const [availableBranches, setAvailableBranches] = useState<Record<string, string[]>>({});
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [addingRepo, setAddingRepo] = useState(false);

  const [pollingInterval, setPollingIntervalLocal] = useState(30);
  const [tokenInput, setTokenInput] = useState<Record<string, string>>({});
  const [connectingService, setConnectingService] = useState<string | null>(null);

  // Vercel watched projects
  const [watchedVercelProjects, setWatchedVercelProjectsLocal] = useState<string[]>([]);
  const [availableVercelProjects, setAvailableVercelProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingVercelProjects, setLoadingVercelProjects] = useState(false);
  const [addingVercelProject, setAddingVercelProject] = useState(false);

  const githubConnected = connectors.find((c) => c.id === 'github')?.connected;
  const vercelConnected = connectors.find((c) => c.id === 'vercel')?.connected;

  useEffect(() => {
    if (githubConnected) {
      window.vitals.github.getWatchedRepos().then(setWatchedReposLocal);
    }
    if (vercelConnected) {
      window.vitals.vercel?.getWatchedProjects().then(setWatchedVercelProjectsLocal);
    }
    window.vitals.getPollingInterval().then((sec) => {
      setPollingIntervalLocal(sec);
      useVitalsStore.setState({ pollingIntervalSec: sec });
    });
  }, [githubConnected, vercelConnected]);

  const handlePollingChange = useCallback(async (sec: number) => {
    setPollingIntervalLocal(sec);
    useVitalsStore.setState({ pollingIntervalSec: sec });
    await window.vitals.setPollingInterval(sec);
  }, []);

  useEffect(() => {
    window.vitals.github.onDeviceFlowSuccess(() => {
      setConnectorConnected('github', true);
      resetDeviceFlow();
    });
  }, [setConnectorConnected, resetDeviceFlow]);

  const handleConnect = () => {
    setDeviceFlow({ step: 'client_id', error: null });
  };

  const handleStartDeviceFlow = async () => {
    if (!deviceFlow.clientId.trim()) return;
    setDeviceFlow({ error: null });
    const result = await window.vitals.github.startDeviceFlow(deviceFlow.clientId.trim());
    if (result.success && result.data) {
      setDeviceFlow({ step: 'waiting', userCode: result.data.userCode });
    } else {
      setDeviceFlow({ error: result.error || 'failed to start' });
    }
  };

  const handleCancelFlow = () => {
    window.vitals.github.cancelDeviceFlow();
    resetDeviceFlow();
  };

  const handleDisconnect = async (id: string) => {
    if (id === 'github') {
      await window.vitals.github.disconnect();
      setConnectorConnected('github', false);
      setWatchedReposLocal([]);
    } else if (id === 'vercel') {
      await window.vitals.vercel.disconnect();
      setConnectorConnected('vercel', false);
    } else if (id === 'sentry') {
      await window.vitals.sentry.disconnect();
      setConnectorConnected('sentry', false);
    }
  };

  const handleTokenConnect = async (id: string) => {
    const token = tokenInput[id]?.trim();
    if (!token) return;
    let result: { success: boolean; error?: string };
    if (id === 'vercel') {
      result = await window.vitals.vercel.setToken(token);
    } else if (id === 'sentry') {
      result = await window.vitals.sentry.setToken(token);
    } else {
      return;
    }
    if (result.success) {
      setConnectorConnected(id, true);
      setConnectingService(null);
      setTokenInput((prev) => ({ ...prev, [id]: '' }));
    }
  };

  const loadAvailableRepos = async () => {
    setLoadingRepos(true);
    const result = await window.vitals.github.listRepos();
    if (result.success && result.data) setAvailableRepos(result.data);
    setLoadingRepos(false);
    setAddingRepo(true);
  };

  const addRepo = async (repo: RepoOption) => {
    const brResult = await window.vitals.github.listBranches(repo.fullName);
    const branches = brResult.success && brResult.data ? brResult.data : [repo.defaultBranch];
    setAvailableBranches((prev) => ({ ...prev, [repo.fullName]: branches }));
    const newWatched = [...watchedRepos, { fullName: repo.fullName, branches: [repo.defaultBranch] }];
    setWatchedReposLocal(newWatched);
    await window.vitals.github.setWatchedRepos(newWatched);
    setAddingRepo(false);
    window.vitals.forceRefresh();
  };

  const removeRepo = async (fullName: string) => {
    const newWatched = watchedRepos.filter((r) => r.fullName !== fullName);
    setWatchedReposLocal(newWatched);
    await window.vitals.github.setWatchedRepos(newWatched);
    window.vitals.forceRefresh();
  };

  const toggleBranch = async (repoFullName: string, branch: string) => {
    const newWatched = watchedRepos.map((r) => {
      if (r.fullName !== repoFullName) return r;
      const has = r.branches.includes(branch);
      return { ...r, branches: has ? r.branches.filter((b) => b !== branch) : [...r.branches, branch] };
    });
    setWatchedReposLocal(newWatched);
    await window.vitals.github.setWatchedRepos(newWatched);
    window.vitals.forceRefresh();
  };

  const loadBranchesForRepo = async (fullName: string) => {
    if (availableBranches[fullName]) return;
    const result = await window.vitals.github.listBranches(fullName);
    if (result.success && result.data) setAvailableBranches((prev) => ({ ...prev, [fullName]: result.data! }));
  };

  // Vercel project management
  const loadVercelProjects = async () => {
    if (!window.vitals.vercel) return;
    setLoadingVercelProjects(true);
    try {
      const result = await window.vitals.vercel.listProjects();
      if (result?.success && result.data) setAvailableVercelProjects(result.data);
    } catch (err) {
      console.error('Failed to load Vercel projects:', err);
    }
    setLoadingVercelProjects(false);
    setAddingVercelProject(true);
  };

  const addVercelProject = async (name: string) => {
    const updated = [...watchedVercelProjects, name];
    setWatchedVercelProjectsLocal(updated);
    await window.vitals.vercel?.setWatchedProjects(updated);
    setAddingVercelProject(false);
    window.vitals.forceRefresh();
  };

  const removeVercelProject = async (name: string) => {
    const updated = watchedVercelProjects.filter((p) => p !== name);
    setWatchedVercelProjectsLocal(updated);
    await window.vitals.vercel?.setWatchedProjects(updated);
    window.vitals.forceRefresh();
  };

  return (
    <div
      style={{
        padding: `${spacing.panelPaddingY + 4}px ${spacing.panelPaddingX}px`,
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {/* connectors */}
        <div style={{ marginBottom: spacing.sectionGap }}>
          <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, textTransform: 'lowercase', marginBottom: spacing.lineGap + 2 }}>
            connectors
          </div>
          {connectors.map((connector, i) => (
            <div key={connector.id}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: `${spacing.lineGap + 2}px 0`,
                  borderBottom: i < connectors.length - 1 && deviceFlow.step === 'idle' ? `0.5px solid ${colors.divider}` : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: connector.connected ? colors.healthy : colors.textTertiary }} />
                  <span style={{ fontSize: fontSize.bodyLarge, color: colors.textPrimary, textTransform: 'lowercase' }}>{connector.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {connector.connected && (
                    <button onClick={() => handleDisconnect(connector.id)} style={btnStyle('ghost')}>disconnect</button>
                  )}
                  {!connector.connected && connector.id === 'github' && deviceFlow.step === 'idle' && (
                    <button onClick={handleConnect} style={btnStyle('subtle')}>connect</button>
                  )}
                  {!connector.connected && (connector.id === 'vercel' || connector.id === 'sentry') && connectingService !== connector.id && (
                    <button onClick={() => setConnectingService(connector.id)} style={btnStyle('subtle')}>connect</button>
                  )}
                </div>
              </div>

              {/* Device Flow — step 1: enter client ID */}
              {connector.id === 'github' && deviceFlow.step === 'client_id' && (
                <div style={{ padding: `${spacing.lineGap + 2}px 0`, borderBottom: i < connectors.length - 1 ? `0.5px solid ${colors.divider}` : 'none' }}>
                  <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, marginBottom: 6, lineHeight: 1.4 }}>
                    create a github oauth app at github.com/settings/developers, then paste the client id
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={deviceFlow.clientId}
                      onChange={(e) => setDeviceFlow({ clientId: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && handleStartDeviceFlow()}
                      placeholder="Ov23li..."
                      style={inputStyle}
                      autoFocus
                    />
                    <button onClick={handleStartDeviceFlow} style={btnStyle('primary')}>connect</button>
                    <button onClick={handleCancelFlow} style={btnStyle('ghost')}>cancel</button>
                  </div>
                  {deviceFlow.error && (
                    <div style={{ fontSize: fontSize.labelSecondary, color: colors.incident, marginTop: 4 }}>{deviceFlow.error}</div>
                  )}
                </div>
              )}

              {/* Device Flow — step 2: show code */}
              {/* Token auth — Vercel / Sentry */}
              {(connector.id === 'vercel' || connector.id === 'sentry') && connectingService === connector.id && (
                <div style={{ padding: `${spacing.lineGap + 2}px 0`, borderBottom: i < connectors.length - 1 ? `0.5px solid ${colors.divider}` : 'none' }}>
                  <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, marginBottom: 6, lineHeight: 1.4 }}>
                    {connector.id === 'vercel'
                      ? 'paste your vercel access token (vercel.com/account/tokens)'
                      : 'paste your sentry auth token (sentry.io/settings/auth-tokens)'}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={tokenInput[connector.id] || ''}
                      onChange={(e) => setTokenInput((prev) => ({ ...prev, [connector.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleTokenConnect(connector.id)}
                      placeholder={connector.id === 'vercel' ? 'token...' : 'sntrys_...'}
                      type="password"
                      style={inputStyle}
                      autoFocus
                    />
                    <button onClick={() => handleTokenConnect(connector.id)} style={btnStyle('primary')}>connect</button>
                    <button onClick={() => setConnectingService(null)} style={btnStyle('ghost')}>cancel</button>
                  </div>
                </div>
              )}

              {connector.id === 'github' && deviceFlow.step === 'waiting' && (
                <div style={{ padding: `${spacing.lineGap + 2}px 0`, borderBottom: i < connectors.length - 1 ? `0.5px solid ${colors.divider}` : 'none' }}>
                  <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, marginBottom: 8 }}>
                    enter this code on github.com/login/device
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        fontSize: 18,
                        fontWeight: 600,
                        fontFamily: fonts.mono,
                        color: colors.action,
                        letterSpacing: '0.15em',
                        background: colors.subtle,
                        padding: '6px 14px',
                        borderRadius: 6,
                        userSelect: 'text',
                        WebkitUserSelect: 'text',
                      }}
                    >
                      {deviceFlow.userCode}
                    </span>
                    <div style={{ fontSize: fontSize.labelSecondary, color: colors.anomaly }}>
                      waiting for authorization...
                    </div>
                  </div>
                  <button onClick={handleCancelFlow} style={{ ...btnStyle('ghost'), marginTop: 8 }}>cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* watched repos */}
        {githubConnected && (
          <div style={{ borderTop: `0.5px solid ${colors.divider}`, paddingTop: spacing.sectionGap, marginBottom: spacing.sectionGap }}>
            <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, textTransform: 'lowercase', marginBottom: spacing.lineGap + 2 }}>
              watched repos
            </div>
            {watchedRepos.map((repo) => (
              <div key={repo.fullName} style={{ paddingBottom: spacing.lineGap + 2, marginBottom: spacing.lineGap + 2, borderBottom: `0.5px solid ${colors.divider}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: fontSize.bodyLarge, color: colors.textPrimary, fontFamily: fonts.mono }}>{repo.fullName}</span>
                  <button onClick={() => removeRepo(repo.fullName)} style={btnStyle('ghost')}>remove</button>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(availableBranches[repo.fullName] || repo.branches).map((branch) => {
                    const active = repo.branches.includes(branch);
                    return (
                      <button key={branch} onClick={() => toggleBranch(repo.fullName, branch)} onMouseEnter={() => loadBranchesForRepo(repo.fullName)}
                        style={{ background: active ? 'rgba(255,255,255,0.12)' : colors.subtle, border: 'none', borderRadius: 3, color: active ? colors.action : colors.textTertiary, fontSize: fontSize.labelSecondary, fontFamily: fonts.mono, padding: '2px 6px', cursor: 'pointer' }}>
                        {branch}
                      </button>
                    );
                  })}
                  <button onClick={() => loadBranchesForRepo(repo.fullName)}
                    style={{ background: 'none', border: `0.5px solid ${colors.divider}`, borderRadius: 3, color: colors.textTertiary, fontSize: fontSize.labelSecondary, padding: '2px 6px', cursor: 'pointer' }}>
                    + branch
                  </button>
                </div>
              </div>
            ))}
            {!addingRepo ? (
              <button onClick={loadAvailableRepos} disabled={loadingRepos} style={{ ...btnStyle('subtle'), opacity: loadingRepos ? 0.5 : 1 }}>
                {loadingRepos ? 'loading...' : '+ add repo'}
              </button>
            ) : (
              <div style={{ maxHeight: 100, overflowY: 'auto' }}>
                {availableRepos.filter((r) => !watchedRepos.some((w) => w.fullName === r.fullName)).map((repo) => (
                  <div key={repo.fullName} onClick={() => addRepo(repo)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0', cursor: 'pointer', borderBottom: `0.5px solid ${colors.divider}` }}>
                    <span style={{ fontSize: fontSize.body, color: colors.textPrimary, fontFamily: fonts.mono }}>{repo.fullName}</span>
                    <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>{repo.defaultBranch}</span>
                  </div>
                ))}
                <button onClick={() => setAddingRepo(false)} style={{ ...btnStyle('ghost'), marginTop: 4 }}>cancel</button>
              </div>
            )}
          </div>
        )}

        {/* watched vercel projects */}
        {vercelConnected && (
          <div style={{ borderTop: `0.5px solid ${colors.divider}`, paddingTop: spacing.sectionGap, marginBottom: spacing.sectionGap }}>
            <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, textTransform: 'lowercase', marginBottom: spacing.lineGap + 2 }}>
              watched projects (vercel)
            </div>
            {watchedVercelProjects.map((project) => (
              <div key={project} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing.lineGap + 2, marginBottom: spacing.lineGap + 2, borderBottom: `0.5px solid ${colors.divider}` }}>
                <span style={{ fontSize: fontSize.bodyLarge, color: colors.textPrimary, fontFamily: fonts.mono }}>{project}</span>
                <button onClick={() => removeVercelProject(project)} style={btnStyle('ghost')}>remove</button>
              </div>
            ))}
            {!addingVercelProject ? (
              <button onClick={loadVercelProjects} disabled={loadingVercelProjects} style={{ ...btnStyle('subtle'), opacity: loadingVercelProjects ? 0.5 : 1 }}>
                {loadingVercelProjects ? 'loading...' : '+ add project'}
              </button>
            ) : (
              <div style={{ maxHeight: 100, overflowY: 'auto' }}>
                {availableVercelProjects.filter((p) => !watchedVercelProjects.includes(p.name)).map((project) => (
                  <div key={project.id} onClick={() => addVercelProject(project.name)}
                    style={{ display: 'flex', alignItems: 'center', padding: '3px 0', cursor: 'pointer', borderBottom: `0.5px solid ${colors.divider}` }}>
                    <span style={{ fontSize: fontSize.body, color: colors.textPrimary, fontFamily: fonts.mono }}>{project.name}</span>
                  </div>
                ))}
                <button onClick={() => setAddingVercelProject(false)} style={{ ...btnStyle('ghost'), marginTop: 4 }}>cancel</button>
              </div>
            )}
          </div>
        )}

        {/* preferences */}
        <div style={{ borderTop: `0.5px solid ${colors.divider}`, paddingTop: spacing.sectionGap }}>
          <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, textTransform: 'lowercase', marginBottom: spacing.lineGap + 2 }}>preferences</div>
          <PrefRow label="Hotkey" value="⌘⇧N" />
          {/* polling interval */}
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: `${spacing.lineGap + 2}px 0`,
              borderBottom: `0.5px solid ${colors.divider}`,
            }}
          >
            <span style={{ fontSize: fontSize.body, color: colors.textPrimary }}>Polling interval</span>
            <div style={{ display: 'flex', gap: 3 }}>
              {POLLING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handlePollingChange(opt.value)}
                  style={{
                    background: pollingInterval === opt.value ? 'rgba(255,255,255,0.12)' : colors.subtle,
                    border: 'none',
                    borderRadius: 3,
                    color: pollingInterval === opt.value ? colors.action : colors.textTertiary,
                    fontSize: fontSize.labelSecondary,
                    padding: '2px 6px',
                    cursor: 'pointer',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <PrefRow label="Smart silence" value="on" valueColor={colors.healthy} />
          <PrefRow label="Launch at login" value="on" valueColor={colors.healthy} last />
        </div>
      </div>

      <div style={{ paddingTop: spacing.sectionGap, flexShrink: 0 }}>
        <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary }}>vitals v1.0.0</span>
      </div>
    </div>
  );
}

function PrefRow({ label, value, valueColor, last }: { label: string; value: string; valueColor?: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${spacing.lineGap + 2}px 0`, borderBottom: last ? 'none' : `0.5px solid ${colors.divider}` }}>
      <span style={{ fontSize: fontSize.body, color: colors.textPrimary }}>{label}</span>
      <span style={{ fontSize: fontSize.labelSecondary, color: valueColor || colors.textTertiary, ...(label === 'Hotkey' ? { background: colors.subtle, padding: '2px 6px', borderRadius: 3 } : {}) }}>{value}</span>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1, background: colors.subtle, border: `0.5px solid ${colors.divider}`, borderRadius: 4,
  color: colors.textPrimary, fontSize: fontSize.labelSecondary, fontFamily: fonts.mono, padding: '4px 8px', outline: 'none',
};

function btnStyle(variant: 'primary' | 'ghost' | 'subtle'): React.CSSProperties {
  if (variant === 'primary') return { background: colors.action, border: 'none', borderRadius: 4, color: '#000', fontSize: fontSize.labelSecondary, fontWeight: 600, padding: '4px 10px', cursor: 'pointer' };
  if (variant === 'subtle') return { background: colors.subtle, border: 'none', borderRadius: 5, color: colors.action, fontSize: fontSize.labelSecondary, padding: '3px 10px', cursor: 'pointer' };
  return { background: 'none', border: `0.5px solid ${colors.divider}`, borderRadius: 5, color: colors.textTertiary, fontSize: fontSize.labelSecondary, padding: '3px 8px', cursor: 'pointer' };
}
