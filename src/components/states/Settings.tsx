import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties } from 'react';
import { useVitalsStore } from '../../store/useVitalsStore';
import { colors, fontSize, spacing, fonts } from '../../lib/design-tokens';
import { integrationIcons } from '../NotchHeader';

function AccordionPanel({ open, children }: { open: boolean; children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(open ? undefined : 0);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    if (open) {
      setHeight(el.scrollHeight);
      const id = setTimeout(() => setHeight(undefined), 320);
      return () => clearTimeout(id);
    } else {
      setHeight(el.scrollHeight);
      requestAnimationFrame(() => requestAnimationFrame(() => setHeight(0)));
    }
  }, [open]);

  return (
    <div
      style={{
        overflow: 'hidden',
        height: height === undefined ? 'auto' : height,
        transition: 'height 0.3s cubic-bezier(0.32, 0.72, 0.3, 1), opacity 0.25s ease',
        opacity: open ? 1 : 0,
      }}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

const TOKEN_URLS: Record<string, { label: string; url: string; hint: string }> = {
  github: { label: 'github.com/settings/developers', url: 'https://github.com/settings/developers', hint: 'create a github oauth app, then paste the client id' },
  vercel: { label: 'vercel.com/account/tokens', url: 'https://vercel.com/account/tokens', hint: 'create an access token at' },
  sentry: { label: 'sentry.io/settings/auth-tokens', url: 'https://sentry.io/settings/auth-tokens/', hint: 'create an auth token at' },
  openai: { label: 'platform.openai.com/api-keys', url: 'https://platform.openai.com/api-keys', hint: 'create an admin api key at' },
  anthropic: { label: 'platform.claude.com/settings/admin-keys', url: 'https://platform.claude.com/settings/admin-keys', hint: 'create an admin api key (sk-ant-admin...) at' },
  datadog: { label: 'app.datadoghq.com/…/api-keys', url: 'https://app.datadoghq.com/organization-settings/api-keys', hint: 'get api key + app key at' },
  posthog: { label: 'posthog.com/settings', url: 'https://us.posthog.com/settings/user-api-keys', hint: 'get personal api key at' },
  segment: { label: 'segment.com/docs/api', url: 'https://segment.com/docs/api/', hint: 'get your public api token at' },
  chrome: { label: 'chrome://inspect', url: '', hint: 'start chrome with --remote-debugging-port=9222, then enter port' },
};

function LinkText({ label, url }: { label: string; url: string }) {
  const [hovered, setHovered] = useState(false);
  const style: CSSProperties = {
    color: hovered ? '#fff' : colors.action,
    cursor: 'pointer',
    textDecoration: 'underline',
    textDecorationColor: hovered ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)',
    transition: 'color 0.15s, text-decoration-color 0.15s',
  };
  return (
    <span
      onClick={() => window.vitals.openExternal(url)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={style}
    >
      {label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      style={{
        background: colors.subtle,
        border: `0.5px solid ${colors.divider}`,
        borderRadius: 8,
        color: copied ? colors.healthy : colors.textTertiary,
        fontSize: fontSize.labelSecondary,
        padding: '4px 8px',
        cursor: 'pointer',
        transition: 'color 0.15s',
      }}
    >
      {copied ? 'copied!' : 'copy'}
    </button>
  );
}

const POLLING_OPTIONS = [
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '2m', value: 120 },
  { label: '5m', value: 300 },
];

function HourStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const dec = () => onChange((value - 1 + 24) % 24);
  const inc = () => onChange((value + 1) % 24);
  const label = `${String(value).padStart(2, '0')}:00`;
  const arrowStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: 'none',
    borderRadius: 6,
    color: colors.textSecondary,
    cursor: 'pointer',
    fontSize: 14,
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    lineHeight: 1,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <button onClick={dec} style={arrowStyle}>‹</button>
      <span style={{ fontSize: 12, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums', color: colors.healthy, minWidth: 36, textAlign: 'center' }}>{label}</span>
      <button onClick={inc} style={arrowStyle}>›</button>
    </div>
  );
}

function ToggleSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 34, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer',
        position: 'relative', padding: 0, flexShrink: 0,
        background: on ? 'rgba(52, 211, 153, 0.35)' : 'rgba(255,255,255,0.10)',
        transition: 'background 0.2s',
      }}
    >
      <div style={{
        width: 14, height: 14, borderRadius: '50%',
        background: on ? colors.healthy : 'rgba(255,255,255,0.35)',
        position: 'absolute', top: 2,
        left: on ? 18 : 2,
        transition: 'left 0.2s, background 0.2s',
      }} />
    </button>
  );
}

const RESTING_MODE_OPTIONS: Array<{ value: 'carousel' | 'vitals' | 'fixed'; label: string; icon: string; description: string }> = [
  { value: 'carousel', label: 'carousel', icon: '↔', description: 'rotates health and activity from each integration' },
  { value: 'vitals', label: 'vitals', icon: '~', description: 'EKG animation that changes color based on overall health' },
  { value: 'fixed', label: 'polling', icon: '◔', description: 'shows polling countdown and last sync time' },
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
  const [branchFilter, setBranchFilter] = useState<Record<string, string>>({});
  const [filteringBranches, setFilteringBranches] = useState<string | null>(null);

  const [pollingInterval, setPollingIntervalLocal] = useState(30);
  const restingMode = useVitalsStore((s) => s.restingMode);
  const [restingModeLocal, setRestingModeLocal] = useState<'carousel' | 'vitals' | 'fixed'>(restingMode);
  const [launchAtLogin, setLaunchAtLoginLocal] = useState(false);
  const [smartSilence, setSmartSilenceLocal] = useState({ enabled: false, startHour: 19, endHour: 8, weekends: true });
  const [tokenInput, setTokenInput] = useState<Record<string, string>>({});
  const [connectingService, setConnectingService] = useState<string | null>(null);
  const [connectingLoading, setConnectingLoading] = useState(false);
  const [justConnected, setJustConnected] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const hasAnyConnected = connectors.some((c) => c.connected);
  const [showDisconnected, setShowDisconnected] = useState(!hasAnyConnected);
  const [expandedConnector, setExpandedConnector] = useState<string | null>(null);
  const [showWatchedRepos, setShowWatchedRepos] = useState(false);
  const [showWatchedProjects, setShowWatchedProjects] = useState(false);

  // Scroll indicator
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollFade, setShowScrollFade] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setShowScrollFade(el.scrollHeight > el.clientHeight && el.scrollTop + el.clientHeight < el.scrollHeight - 4);
    };
    check();
    el.addEventListener('scroll', check);
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => { el.removeEventListener('scroll', check); observer.disconnect(); };
  }, []);

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
    window.vitals.getRestingMode().then((mode) => {
      const m = mode as 'carousel' | 'vitals' | 'fixed';
      setRestingModeLocal(m);
      useVitalsStore.setState({ restingMode: m });
    });
    window.vitals.getLaunchAtLogin().then(setLaunchAtLoginLocal);
    window.vitals.getSmartSilence().then(setSmartSilenceLocal);
  }, [githubConnected, vercelConnected]);

  const handlePollingChange = useCallback(async (sec: number) => {
    setPollingIntervalLocal(sec);
    useVitalsStore.setState({ pollingIntervalSec: sec });
    await window.vitals.setPollingInterval(sec);
  }, []);

  const handleRestingModeChange = useCallback(async (mode: 'carousel' | 'vitals' | 'fixed') => {
    setRestingModeLocal(mode);
    useVitalsStore.setState({ restingMode: mode });
    await window.vitals.setRestingMode(mode);
  }, []);

  const handleLaunchAtLoginChange = useCallback(async () => {
    const next = !launchAtLogin;
    setLaunchAtLoginLocal(next);
    await window.vitals.setLaunchAtLogin(next);
  }, [launchAtLogin]);

  const handleSmartSilenceToggle = useCallback(async () => {
    const next = { ...smartSilence, enabled: !smartSilence.enabled };
    setSmartSilenceLocal(next);
    await window.vitals.setSmartSilence(next);
    // Update silenced state immediately so the UI reflects the change
    const silenced = await window.vitals.isSilenced();
    useVitalsStore.setState({ isSilenced: silenced });
  }, [smartSilence]);

  const handleSilenceUpdate = useCallback(async (update: Partial<typeof smartSilence>) => {
    const next = { ...smartSilence, ...update };
    setSmartSilenceLocal(next);
    await window.vitals.setSmartSilence(next);
    const silenced = await window.vitals.isSilenced();
    useVitalsStore.setState({ isSilenced: silenced });
  }, [smartSilence]);

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
    } else if (id === 'openai') {
      await window.vitals.openai.disconnect();
      setConnectorConnected('openai', false);
    } else if (id === 'anthropic') {
      await window.vitals.anthropic.disconnect();
      setConnectorConnected('anthropic', false);
    } else if (id === 'datadog') {
      await window.vitals.datadog.disconnect();
      setConnectorConnected('datadog', false);
    } else if (id === 'posthog') {
      await window.vitals.posthog.disconnect();
      setConnectorConnected('posthog', false);
    } else if (id === 'segment') {
      await window.vitals.segment.disconnect();
      setConnectorConnected('segment', false);
    } else if (id === 'chrome') {
      await window.vitals.chrome.disconnect();
      setConnectorConnected('chrome', false);
    }
  };

  const handleTokenConnect = async (id: string) => {
    const token = tokenInput[id]?.trim();
    if (!token) return;
    setConnectingLoading(true);
    let result: { success: boolean; error?: string };
    if (id === 'vercel') {
      result = await window.vitals.vercel.setToken(token);
    } else if (id === 'sentry') {
      result = await window.vitals.sentry.setToken(token);
    } else if (id === 'openai') {
      result = await window.vitals.openai.setToken(token);
    } else if (id === 'anthropic') {
      result = await window.vitals.anthropic.setToken(token);
    } else if (id === 'datadog') {
      result = await window.vitals.datadog.setToken(token);
    } else if (id === 'posthog') {
      result = await window.vitals.posthog.setToken(token);
    } else if (id === 'segment') {
      result = await window.vitals.segment.setToken(token);
    } else if (id === 'chrome') {
      result = await window.vitals.chrome.setPort(token);
    } else {
      setConnectingLoading(false);
      return;
    }
    setConnectingLoading(false);
    if (result.success) {
      setConnectorConnected(id, true);
      setConnectingService(null);
      setTokenInput((prev) => ({ ...prev, [id]: '' }));
      setJustConnected(id);
      setTimeout(() => setJustConnected(null), 2000);
    } else if (result.error) {
      setConnectError(result.error);
      setTimeout(() => setConnectError(null), 4000);
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
        position: 'relative',
      }}
    >
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        {/* connectors accordion */}
        <div style={{ marginBottom: spacing.sectionGap }}>
          {/* Header — clickable to toggle */}
          <div
            onClick={() => setShowDisconnected(!showDisconnected)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              marginBottom: spacing.lineGap + 4,
              padding: '4px 0',
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: colors.textSecondary,
                transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0.3, 1)',
                transform: showDisconnected ? 'rotate(90deg)' : 'rotate(0deg)',
                display: 'inline-block',
              }}
            >
              ▶
            </span>
            <span style={{ fontSize: fontSize.body, color: colors.textPrimary, fontWeight: 500, letterSpacing: '0.01em' }}>
              Connectors
            </span>
            <span
              style={{
                fontSize: fontSize.labelSecondary,
                color: colors.textTertiary,
                marginLeft: 2,
              }}
            >
              {connectors.filter((c) => c.connected).length}/{connectors.length}
            </span>
          </div>

          {/* Connected — always visible */}
          {connectors.filter((c) => c.connected).map((connector, i, arr) => (
            <div
              key={connector.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `${spacing.lineGap + 2}px 0`,
                borderBottom: (i < arr.length - 1 || showDisconnected) ? `0.5px solid ${colors.divider}` : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: colors.healthy, flexShrink: 0 }} />
                <span style={{ color: colors.textPrimary, display: 'flex', alignItems: 'center' }}>
                  {(() => { const Icon = integrationIcons[connector.id]; return Icon ? <Icon size={14} /> : null; })()}
                </span>
                <span style={{ fontSize: fontSize.bodyLarge, color: colors.textPrimary, textTransform: 'lowercase' }}>{connector.name}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {justConnected === connector.id && (
                  <span style={{ fontSize: fontSize.labelSecondary, color: colors.healthy, transition: 'opacity 0.3s' }}>connected!</span>
                )}
                <button onClick={() => handleDisconnect(connector.id)} style={btnStyle('ghost')}>disconnect</button>
              </div>
            </div>
          ))}

          {/* Disconnected — animated accordion */}
          <AccordionPanel open={showDisconnected}>
          {connectors.filter((c) => !c.connected).map((connector, i, arr) => {
            const isConnecting = connectingService === connector.id || (connector.id === 'github' && deviceFlow.step !== 'idle');
            return (
            <div key={connector.id}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: `${spacing.lineGap + 2}px 0`,
                  borderBottom: !isConnecting && i < arr.length - 1 ? `0.5px solid ${colors.divider}` : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: colors.textTertiary, flexShrink: 0 }} />
                  <span style={{ color: colors.textTertiary, display: 'flex', alignItems: 'center' }}>
                    {(() => { const Icon = integrationIcons[connector.id]; return Icon ? <Icon size={14} /> : null; })()}
                  </span>
                  <span style={{ fontSize: fontSize.bodyLarge, color: colors.textPrimary, textTransform: 'lowercase' }}>{connector.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {!connector.connected && connector.id === 'github' && deviceFlow.step === 'idle' && (
                    <button onClick={handleConnect} style={btnStyle('subtle')}>connect</button>
                  )}
                  {!connector.connected && connector.id !== 'github' && connectingService !== connector.id && (
                    <button onClick={() => setConnectingService(connector.id)} style={btnStyle('subtle')}>connect</button>
                  )}
                </div>
              </div>

              {/* GitHub device flow steps */}
              {connector.id === 'github' && deviceFlow.step === 'client_id' && (
                <div style={{ padding: `${spacing.lineGap}px 0 ${spacing.lineGap + 2}px`, borderBottom: i < arr.length - 1 ? `0.5px solid ${colors.divider}` : 'none' }}>
                  <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, marginBottom: 6, lineHeight: 1.4 }}>
                    {TOKEN_URLS.github.hint}{' '}
                    <LinkText label={TOKEN_URLS.github.label} url={TOKEN_URLS.github.url} />
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
              {connector.id === 'github' && deviceFlow.step === 'waiting' && (
                <div style={{ padding: `${spacing.lineGap}px 0 ${spacing.lineGap + 2}px`, borderBottom: i < arr.length - 1 ? `0.5px solid ${colors.divider}` : 'none' }}>
                  <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, marginBottom: 8 }}>
                    enter this code on{' '}
                    <LinkText label="github.com/login/device" url="https://github.com/login/device" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        fontSize: 18, fontWeight: 600, fontFamily: fonts.mono, color: colors.action,
                        letterSpacing: '0.15em', background: colors.subtle, padding: '6px 14px',
                        borderRadius: 6, userSelect: 'text', WebkitUserSelect: 'text',
                      }}
                    >
                      {deviceFlow.userCode}
                    </span>
                    <CopyButton text={deviceFlow.userCode} />
                    <div style={{ fontSize: fontSize.labelSecondary, color: colors.anomaly }}>
                      waiting for authorization...
                    </div>
                  </div>
                  <button onClick={handleCancelFlow} style={{ ...btnStyle('ghost'), marginTop: 8 }}>cancel</button>
                </div>
              )}

              {/* Token auth — inline input */}
              {connector.id !== 'github' && connectingService === connector.id && (
                <div style={{ padding: `${spacing.lineGap}px 0 ${spacing.lineGap + 2}px`, borderBottom: i < arr.length - 1 ? `0.5px solid ${colors.divider}` : 'none' }}>
                  <div style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, marginBottom: 6, lineHeight: 1.4 }}>
                    {TOKEN_URLS[connector.id]?.hint}{' '}
                    <LinkText label={TOKEN_URLS[connector.id]?.label || ''} url={TOKEN_URLS[connector.id]?.url || ''} />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={tokenInput[connector.id] || ''}
                      onChange={(e) => setTokenInput((prev) => ({ ...prev, [connector.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleTokenConnect(connector.id)}
                      placeholder={{ vercel: 'token...', sentry: 'sntrys_...', openai: 'sk-admin-...', anthropic: 'sk-ant-admin-...', datadog: 'api_key:app_key', posthog: 'phx_...:12345', segment: 'token...', chrome: '9222' }[connector.id] || 'token...'}
                      type={connector.id === 'chrome' ? 'text' : 'password'}
                      style={inputStyle}
                      autoFocus
                    />
                    <button onClick={() => handleTokenConnect(connector.id)} disabled={connectingLoading} style={{ ...btnStyle('primary'), opacity: connectingLoading ? 0.6 : 1 }}>
                      {connectingLoading ? 'connecting...' : 'connect'}
                    </button>
                    <button onClick={() => setConnectingService(null)} disabled={connectingLoading} style={btnStyle('ghost')}>cancel</button>
                  </div>
                  {connectError && connectingService === connector.id && (
                    <div style={{ fontSize: fontSize.labelSecondary, color: colors.incident, marginTop: 4 }}>{connectError}</div>
                  )}
                </div>
              )}
            </div>
            );
          })}
          </AccordionPanel>
        </div>

        {/* watched repos accordion */}
        {githubConnected && (
          <div style={{ borderTop: `0.5px solid ${colors.divider}`, paddingTop: spacing.sectionGap, marginBottom: spacing.sectionGap }}>
            <div
              onClick={() => setShowWatchedRepos(!showWatchedRepos)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                marginBottom: spacing.lineGap + 4,
                padding: '4px 0',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: colors.textSecondary,
                  transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0.3, 1)',
                  transform: showWatchedRepos ? 'rotate(90deg)' : 'rotate(0deg)',
                  display: 'inline-block',
                }}
              >
                ▶
              </span>
              <span style={{ fontSize: fontSize.body, color: colors.textPrimary, fontWeight: 500, letterSpacing: '0.01em' }}>
                Watched repos
              </span>
              <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, marginLeft: 2 }}>
                {watchedRepos.length}
              </span>
            </div>

            {/* Collapsed summary — repo names + branch count */}
            {!showWatchedRepos && watchedRepos.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {watchedRepos.map((repo) => {
                  const repoName = repo.fullName.includes('/') ? repo.fullName.split('/')[1] : repo.fullName;
                  return (
                    <span
                      key={repo.fullName}
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        borderRadius: 6,
                        color: colors.textSecondary,
                        fontSize: fontSize.labelSecondary,
                        fontFamily: fonts.mono,
                        padding: '2px 7px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {repoName}
                      <span style={{ color: colors.textTertiary, fontSize: 11 }}>{repo.branches.length}b</span>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Expanded — full management */}
            <AccordionPanel open={showWatchedRepos}>
              {watchedRepos.map((repo) => (
                <div key={repo.fullName} style={{ paddingBottom: spacing.lineGap + 2, marginBottom: spacing.lineGap + 2, borderBottom: `0.5px solid ${colors.divider}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: fontSize.bodyLarge, color: colors.textPrimary, fontFamily: fonts.mono }}>{repo.fullName}</span>
                    <button onClick={() => removeRepo(repo.fullName)} style={btnStyle('ghost')}>remove</button>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {repo.branches.map((branch) => (
                      <button key={branch} onClick={() => toggleBranch(repo.fullName, branch)}
                        style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 6, color: colors.action, fontSize: fontSize.labelSecondary, fontFamily: fonts.mono, padding: '2px 6px', cursor: 'pointer' }}>
                        {branch}
                      </button>
                    ))}
                    {filteringBranches !== repo.fullName ? (
                      <button onClick={async () => { await loadBranchesForRepo(repo.fullName); setFilteringBranches(repo.fullName); setBranchFilter((p) => ({ ...p, [repo.fullName]: '' })); }}
                        style={{ background: 'none', border: `0.5px solid ${colors.divider}`, borderRadius: 6, color: colors.textTertiary, fontSize: fontSize.labelSecondary, padding: '2px 6px', cursor: 'pointer' }}>
                        + branch
                      </button>
                    ) : (
                      <button onClick={() => setFilteringBranches(null)}
                        style={{ background: 'none', border: `0.5px solid ${colors.divider}`, borderRadius: 6, color: colors.textTertiary, fontSize: fontSize.labelSecondary, padding: '2px 6px', cursor: 'pointer' }}>
                        done
                      </button>
                    )}
                  </div>
                  {filteringBranches === repo.fullName && (
                    <div style={{ marginTop: 6 }}>
                      <input
                        value={branchFilter[repo.fullName] || ''}
                        onChange={(e) => setBranchFilter((p) => ({ ...p, [repo.fullName]: e.target.value }))}
                        placeholder="filter branches..."
                        style={{ ...inputStyle, marginBottom: 4, width: '100%' }}
                        autoFocus
                      />
                      <div style={{ maxHeight: 80, overflowY: 'auto', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {(availableBranches[repo.fullName] || [])
                          .filter((b) => !repo.branches.includes(b))
                          .filter((b) => !branchFilter[repo.fullName] || b.toLowerCase().includes(branchFilter[repo.fullName].toLowerCase()))
                          .map((branch) => (
                            <button key={branch} onClick={() => toggleBranch(repo.fullName, branch)}
                              style={{ background: colors.subtle, border: 'none', borderRadius: 6, color: colors.textTertiary, fontSize: fontSize.labelSecondary, fontFamily: fonts.mono, padding: '2px 6px', cursor: 'pointer' }}>
                              {branch}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
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
            </AccordionPanel>
          </div>
        )}

        {/* watched vercel projects accordion */}
        {vercelConnected && (
          <div style={{ borderTop: `0.5px solid ${colors.divider}`, paddingTop: spacing.sectionGap, marginBottom: spacing.sectionGap }}>
            <div
              onClick={() => setShowWatchedProjects(!showWatchedProjects)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                marginBottom: spacing.lineGap + 4,
                padding: '4px 0',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: colors.textSecondary,
                  transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0.3, 1)',
                  transform: showWatchedProjects ? 'rotate(90deg)' : 'rotate(0deg)',
                  display: 'inline-block',
                }}
              >
                ▶
              </span>
              <span style={{ fontSize: fontSize.body, color: colors.textPrimary, fontWeight: 500, letterSpacing: '0.01em' }}>
                Watched projects
              </span>
              <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, marginLeft: 2 }}>
                {watchedVercelProjects.length}
              </span>
            </div>

            {/* Collapsed summary — project name tags */}
            {!showWatchedProjects && watchedVercelProjects.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {watchedVercelProjects.map((project) => (
                  <span
                    key={project}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: 6,
                      color: colors.textSecondary,
                      fontSize: fontSize.labelSecondary,
                      fontFamily: fonts.mono,
                      padding: '2px 7px',
                    }}
                  >
                    {project}
                  </span>
                ))}
              </div>
            )}

            {/* Expanded — full management */}
            <AccordionPanel open={showWatchedProjects}>
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
            </AccordionPanel>
          </div>
        )}

        {/* preferences */}
        <div
          style={{
            marginTop: spacing.lineGap,
            background: 'rgba(52, 211, 153, 0.06)',
            border: '0.5px solid rgba(52, 211, 153, 0.12)',
            borderRadius: 10,
            padding: `${spacing.sectionGap}px ${spacing.panelPaddingX - 6}px`,
          }}
        >
          <div
            style={{
              fontSize: fontSize.body,
              color: colors.healthy,
              fontWeight: 500,
              letterSpacing: '0.01em',
              marginBottom: spacing.lineGap + 4,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ display: 'block', flexShrink: 0 }}>
              <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm-.5 4v4.5h1V5h-1Zm0 6v1h1v-1h-1Z" fill={colors.healthy} fillRule="evenodd" />
            </svg>
            Preferences
          </div>
          <PrefRow label="Hotkey" value="⌘⇧N" accent />
          {/* polling interval */}
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: `${spacing.lineGap + 2}px 0`,
              borderBottom: `0.5px solid rgba(52, 211, 153, 0.10)`,
            }}
          >
            <span style={{ fontSize: fontSize.body, color: colors.textPrimary }}>Polling interval</span>
            <div style={{ display: 'flex', gap: 3 }}>
              {POLLING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handlePollingChange(opt.value)}
                  style={{
                    background: pollingInterval === opt.value ? 'rgba(52, 211, 153, 0.18)' : 'rgba(255,255,255,0.04)',
                    border: 'none',
                    borderRadius: 6,
                    color: pollingInterval === opt.value ? colors.healthy : colors.textTertiary,
                    fontSize: fontSize.labelSecondary,
                    padding: '2px 6px',
                    cursor: 'pointer',
                    fontVariantNumeric: 'tabular-nums',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {/* resting display mode */}
          <div
            style={{
              padding: `${spacing.lineGap + 2}px 0`,
              borderBottom: `0.5px solid rgba(52, 211, 153, 0.10)`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: fontSize.body, color: colors.textPrimary }}>Resting display</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {RESTING_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleRestingModeChange(opt.value)}
                  style={{
                    flex: 1,
                    background: restingModeLocal === opt.value ? 'rgba(52, 211, 153, 0.18)' : 'rgba(255,255,255,0.04)',
                    border: restingModeLocal === opt.value ? '0.5px solid rgba(52, 211, 153, 0.25)' : '0.5px solid transparent',
                    borderRadius: 8,
                    padding: '6px 4px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column' as const,
                    alignItems: 'center',
                    gap: 3,
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{opt.icon}</span>
                  <span style={{
                    fontSize: 11,
                    color: restingModeLocal === opt.value ? colors.healthy : colors.textTertiary,
                    transition: 'color 0.15s',
                    whiteSpace: 'nowrap',
                  }}>
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
            <span style={{ fontSize: 11, color: colors.textTertiary, marginTop: 5, display: 'block', lineHeight: 1.35 }}>
              {RESTING_MODE_OPTIONS.find((o) => o.value === restingModeLocal)?.description}
            </span>
          </div>
          {/* Smart silence */}
          <div style={{ padding: `${spacing.lineGap + 2}px 0`, borderBottom: `0.5px solid rgba(52, 211, 153, 0.10)` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: fontSize.body, color: colors.textPrimary }}>Smart silence</span>
              <ToggleSwitch on={smartSilence.enabled} onToggle={handleSmartSilenceToggle} />
            </div>
            {smartSilence.enabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <HourStepper value={smartSilence.startHour} onChange={(v) => handleSilenceUpdate({ startHour: v })} />
                <span style={{ fontSize: 11, color: colors.textTertiary }}>→</span>
                <HourStepper value={smartSilence.endHour} onChange={(v) => handleSilenceUpdate({ endHour: v })} />
                <button
                  onClick={() => handleSilenceUpdate({ weekends: !smartSilence.weekends })}
                  style={{
                    background: smartSilence.weekends ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255,255,255,0.04)',
                    border: 'none', borderRadius: 6, fontSize: 12, padding: '4px 8px', cursor: 'pointer',
                    color: smartSilence.weekends ? colors.healthy : colors.textTertiary,
                    transition: 'background 0.15s, color 0.15s', marginLeft: 'auto',
                  }}
                >
                  {smartSilence.weekends ? '+ wknd' : 'wknd'}
                </button>
              </div>
            )}
          </div>
          {/* Launch at login */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${spacing.lineGap + 2}px 0` }}>
            <span style={{ fontSize: fontSize.body, color: colors.textPrimary }}>Launch at login</span>
            <ToggleSwitch on={launchAtLogin} onToggle={handleLaunchAtLoginChange} />
          </div>
        </div>
      </div>

      {/* Scroll fade indicator */}
      {showScrollFade && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 24,
            background: 'linear-gradient(transparent, #000)',
            pointerEvents: 'none',
          }}
        />
      )}

    </div>
  );
}

function PrefRow({ label, value, valueColor, last, accent }: { label: string; value: string; valueColor?: string; last?: boolean; accent?: boolean }) {
  const dividerColor = accent ? 'rgba(52, 211, 153, 0.10)' : colors.divider;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${spacing.lineGap + 2}px 0`, borderBottom: last ? 'none' : `0.5px solid ${dividerColor}` }}>
      <span style={{ fontSize: fontSize.body, color: colors.textPrimary }}>{label}</span>
      <span style={{ fontSize: fontSize.labelSecondary, color: valueColor || colors.textTertiary, ...(label === 'Hotkey' ? { background: accent ? 'rgba(52, 211, 153, 0.12)' : colors.subtle, padding: '2px 6px', borderRadius: 3 } : {}) }}>{value}</span>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1, background: colors.subtle, border: `0.5px solid ${colors.divider}`, borderRadius: 8,
  color: colors.textPrimary, fontSize: fontSize.labelSecondary, fontFamily: fonts.mono, padding: '4px 8px', outline: 'none',
};

function btnStyle(variant: 'primary' | 'ghost' | 'subtle'): React.CSSProperties {
  if (variant === 'primary') return { background: colors.action, border: 'none', borderRadius: 8, color: '#000', fontSize: fontSize.labelSecondary, fontWeight: 600, padding: '4px 10px', cursor: 'pointer' };
  if (variant === 'subtle') return { background: colors.subtle, border: 'none', borderRadius: 8, color: colors.action, fontSize: fontSize.labelSecondary, padding: '3px 10px', cursor: 'pointer' };
  return { background: 'none', border: `0.5px solid ${colors.divider}`, borderRadius: 8, color: colors.textTertiary, fontSize: fontSize.labelSecondary, padding: '3px 8px', cursor: 'pointer' };
}
