import { useEffect, useCallback, useRef } from 'react';
import { Notch } from './components/Notch';
import { useVitalsStore } from './store/useVitalsStore';
import { useGeometryStore } from './store/useGeometryStore';
import type { VitalsState } from './store/types';

declare global {
  interface Window {
    vitals: {
      onStateChange: (callback: (state: string) => void) => void;
      setIgnoreMouseEvents: (ignore: boolean) => void;
      setWindowBounds?: (bounds: { width: number; height: number }) => void;
      vercel: {
        setToken: (token: string) => Promise<{ success: boolean; error?: string }>;
        startOAuth: (clientId: string, clientSecret: string) => Promise<{ success: boolean; error?: string }>;
        cancelOAuth: () => Promise<{ success: boolean }>;
        onOAuthSuccess: (callback: () => void) => void;
        disconnect: () => Promise<{ success: boolean }>;
        getSnapshot: () => Promise<{ success: boolean; data?: any; error?: string }>;
        listProjects: () => Promise<{ success: boolean; data?: Array<{ id: string; name: string }>; error?: string }>;
        getWatchedProjects: () => Promise<string[]>;
        setWatchedProjects: (projects: string[]) => Promise<{ success: boolean }>;
        redeploy: (deploymentId: string, projectName: string, target: string) => Promise<{ success: boolean; data?: { uid: string }; error?: string }>;
        cancel: (deploymentId: string) => Promise<{ success: boolean; error?: string }>;
        rollback: (projectId: string, deploymentId: string) => Promise<{ success: boolean; error?: string }>;
        setBoost: (enabled: boolean) => Promise<{ success: boolean }>;
        onSnapshot: (callback: (snapshot: any) => void) => void;
        onError: (callback: (error: string) => void) => void;
      };
      sentry: {
        setToken: (token: string) => Promise<{ success: boolean; error?: string }>;
        disconnect: () => Promise<{ success: boolean }>;
        getSnapshot: () => Promise<{ success: boolean; data?: any; error?: string }>;
        listProjects: () => Promise<{ success: boolean; data?: Array<{ slug: string; name: string }>; error?: string }>;
        getWatchedProjects: () => Promise<string[]>;
        setWatchedProjects: (projects: string[]) => Promise<{ success: boolean }>;
        onSnapshot: (callback: (snapshot: any) => void) => void;
        onError: (callback: (error: string) => void) => void;
      };
      openai: {
        setToken: (token: string) => Promise<{ success: boolean; error?: string }>;
        disconnect: () => Promise<{ success: boolean }>;
        getSnapshot: () => Promise<{ success: boolean; data?: any; error?: string }>;
        onSnapshot: (callback: (snapshot: any) => void) => void;
        onError: (callback: (error: string) => void) => void;
      };
      anthropic: {
        setToken: (token: string) => Promise<{ success: boolean; error?: string }>;
        disconnect: () => Promise<{ success: boolean }>;
        getSnapshot: () => Promise<{ success: boolean; data?: any; error?: string }>;
        onSnapshot: (callback: (snapshot: any) => void) => void;
        onError: (callback: (error: string) => void) => void;
      };
      datadog: {
        setToken: (token: string) => Promise<{ success: boolean; error?: string }>;
        disconnect: () => Promise<{ success: boolean }>;
        getSnapshot: () => Promise<{ success: boolean; data?: any; error?: string }>;
        onSnapshot: (callback: (snapshot: any) => void) => void;
        onError: (callback: (error: string) => void) => void;
      };
      supabase: {
        setToken: (token: string) => Promise<{ success: boolean; error?: string }>;
        disconnect: () => Promise<{ success: boolean }>;
        getSnapshot: () => Promise<{ success: boolean; data?: any; error?: string }>;
        onSnapshot: (callback: (snapshot: any) => void) => void;
        onError: (callback: (error: string) => void) => void;
      };
      system: {
        onSnapshot: (callback: (snapshot: any) => void) => void;
      };
      onDeployCompleted: (callback: (data: { title: string; body: string; success: boolean }) => void) => void;
      onPreferencesChanged: (callback: (changes: Record<string, any>) => void) => void;
      onDataClear: (callback: (service: string) => void) => void;
      onConnectorsChanged: (callback: (status: Record<string, boolean>) => void) => void;
      onWatchedReposChanged: (callback: (repos: Array<{ fullName: string; branches: string[] }>) => void) => void;
      onWatchedVercelProjectsChanged: (callback: (projects: string[]) => void) => void;
      onAnomalyDetected: (callback: (event: any) => void) => void;
      onNotificationPush: (callback: (notification: any) => void) => void;
      onNotificationNavigate: (callback: (data: { integration?: string; state?: string; notificationId: string }) => void) => void;
      openExternal: (url: string) => Promise<void>;
      github: {
        startDeviceFlow: (clientId: string) => Promise<{ success: boolean; data?: { userCode: string; verificationUri: string; expiresIn: number }; error?: string }>;
        cancelDeviceFlow: () => Promise<{ success: boolean }>;
        onDeviceFlowSuccess: (callback: () => void) => void;
        setToken: (token: string) => Promise<{ success: boolean; error?: string }>;
        getSnapshot: () => Promise<{ success: boolean; data?: any; error?: string }>;
        isConfigured: () => Promise<boolean>;
        disconnect: () => Promise<{ success: boolean }>;
        listRepos: () => Promise<{ success: boolean; data?: Array<{ fullName: string; defaultBranch: string }>; error?: string }>;
        listBranches: (repo: string) => Promise<{ success: boolean; data?: string[]; error?: string }>;
        getWatchedRepos: () => Promise<Array<{ fullName: string; branches: string[] }>>;
        setWatchedRepos: (repos: Array<{ fullName: string; branches: string[] }>) => Promise<{ success: boolean }>;
        onSnapshot: (callback: (snapshot: any) => void) => void;
        onError: (callback: (error: string) => void) => void;
      };
      getScreenGeometry: () => Promise<{
        screenWidth: number;
        menuBarHeight: number;
        hasNotch: boolean;
        notchWidth: number;
        notchLeft: number;
        notchRight: number;
      }>;
      getPollingInterval: () => Promise<number>;
      setPollingInterval: (sec: number) => Promise<{ success: boolean }>;
      getRestingMode: () => Promise<string>;
      setRestingMode: (mode: string) => Promise<{ success: boolean }>;
      getLaunchAtLogin: () => Promise<boolean>;
      setLaunchAtLogin: (enabled: boolean) => Promise<{ success: boolean }>;
      getSmartSilence: () => Promise<{ enabled: boolean; startHour: number; endHour: number; weekends: boolean }>;
      setSmartSilence: (config: { enabled: boolean; startHour: number; endHour: number; weekends: boolean }) => Promise<{ success: boolean }>;
      isSilenced: () => Promise<boolean>;
      getConnectorStatus: () => Promise<Record<string, boolean>>;
      forceRefresh: () => Promise<{ success: boolean; refreshed: string[] }>;
      openSettings: () => Promise<{ success: boolean }>;
      streaks: {
        get: () => Promise<any>;
        onUpdated: (callback: (data: any) => void) => void;
      };
      quit: () => Promise<void>;
    };
  }
}

export default function App() {
  const setState = useVitalsStore((s) => s.setState);
  const updateGitHubSnapshot = useVitalsStore((s) => s.updateGitHubSnapshot);
  const updateVercelSnapshot = useVitalsStore((s) => s.updateVercelSnapshot);
  const updateSentrySnapshot = useVitalsStore((s) => s.updateSentrySnapshot);
  const updateServiceSnapshot = useVitalsStore((s) => s.updateServiceSnapshot);
  const setServiceError = useVitalsStore((s) => s.setServiceError);
  const updateConnectorStatus = useVitalsStore((s) => s.updateConnectorStatus);
  const clearServiceData = useVitalsStore((s) => s.clearServiceData);
  const addAnomaly = useVitalsStore((s) => s.addAnomaly);
  const pushNotification = useVitalsStore((s) => s.pushNotification);
  const markNotificationRead = useVitalsStore((s) => s.markNotificationRead);
  const setActiveIntegration = useVitalsStore((s) => s.setActiveIntegration);
  const setGeometry = useGeometryStore((s) => s.setGeometry);

  useEffect(() => {
    window.vitals.getScreenGeometry().then(setGeometry);

    window.vitals.onStateChange((state: string) => {
      setState(state as VitalsState);
    });

    // GitHub device flow: reset state when auth completes (App never unmounts, so this always fires)
    window.vitals.github.onDeviceFlowSuccess(() => {
      useVitalsStore.getState().setConnectorConnected('github', true);
      useVitalsStore.getState().resetDeviceFlow();
    });

    window.vitals.github.onSnapshot((snapshot) => {
      updateGitHubSnapshot(snapshot.data);
      setServiceError('github', null);
    });
    window.vitals.github.onError((error) => {
      console.error('GitHub adapter error:', error);
      setServiceError('github', error);
    });

    window.vitals.vercel?.onSnapshot((snapshot) => {
      updateVercelSnapshot(snapshot.data);
      setServiceError('vercel', null);
    });
    window.vitals.vercel?.onError((error) => {
      console.error('Vercel adapter error:', error);
      setServiceError('vercel', error);
    });

    window.vitals.sentry?.onSnapshot((snapshot) => {
      updateSentrySnapshot(snapshot.data);
      setServiceError('sentry', null);
    });
    window.vitals.sentry?.onError((error) => {
      console.error('Sentry adapter error:', error);
      setServiceError('sentry', error);
    });

    // System monitor — always active, no token
    window.vitals.system?.onSnapshot((snapshot: any) => {
      updateServiceSnapshot('system', snapshot.data);
    });

    // Subscribe to the remaining services
    const services = ['openai', 'anthropic', 'datadog', 'supabase'] as const;
    for (const service of services) {
      window.vitals[service]?.onSnapshot((snapshot: any) => {
        updateServiceSnapshot(service, snapshot.data);
      });
      window.vitals[service]?.onError((error: string) => {
        console.error(`${service} adapter error:`, error);
        setServiceError(service, error);
      });
    }

    window.vitals.onDeployCompleted((data) => {
      useVitalsStore.setState({
        deployFlash: { active: true, success: data.success, message: data.body },
      });
      setTimeout(() => {
        useVitalsStore.setState({ deployFlash: null });
      }, 4000);
    });

    // Sync preferences when changed from settings window (or any other window)
    window.vitals.onPreferencesChanged((changes) => {
      const update: Record<string, any> = {};
      if (changes.restingMode !== undefined) update.restingMode = changes.restingMode;
      if (changes.pollingIntervalSec !== undefined) update.pollingIntervalSec = changes.pollingIntervalSec;
      if (Object.keys(update).length > 0) {
        useVitalsStore.setState(update);
      }
    });

    window.vitals.onDataClear((service) => {
      console.log('[vitals] Clearing stale data for:', service);
      clearServiceData(service);
    });

    window.vitals.onConnectorsChanged((status) => {
      console.log('[vitals] Connector status changed:', status);
      updateConnectorStatus(status);
      // Reload watched repos when connectors change (user may have configured repos)
      if (status.github) {
        window.vitals.github.getWatchedRepos().then((repos) => {
          useVitalsStore.getState().setWatchedRepos(repos);
        });
      }
      if (status.vercel) {
        window.vitals.vercel.getWatchedProjects().then((projects) => {
          useVitalsStore.getState().setWatchedVercelProjects(projects);
        });
      }
    });

    window.vitals.onWatchedReposChanged((repos) => {
      console.log('[vitals] Watched repos changed:', repos.map((r) => r.fullName));
      const store = useVitalsStore.getState();
      store.setWatchedRepos(repos);
      // Reset activeRepo if it was removed
      if (store.activeRepo && !repos.some((r) => r.fullName === store.activeRepo)) {
        store.setActiveRepo('');
      }
    });

    window.vitals.onAnomalyDetected((event) => {
      console.log('[vitals] Anomaly received:', event.id, event.narrative);
      addAnomaly(event);
    });

    window.vitals.onNotificationPush((notification) => {
      pushNotification(notification);
    });

    window.vitals.onNotificationNavigate((data) => {
      // Click-to-action: user clicked a native notification
      if (data.integration) {
        setActiveIntegration(data.integration);
      }
      if (data.state) {
        setState(data.state as any);
      }
      if (data.notificationId) {
        markNotificationRead(data.notificationId);
      }
    });

    window.vitals.getConnectorStatus().then((status) => {
      updateConnectorStatus(status);
    });

    // Load watched repos for the repo picker
    window.vitals.github.getWatchedRepos().then((repos) => {
      useVitalsStore.getState().setWatchedRepos(repos);
    });

    // Load watched Vercel projects for the project picker
    window.vitals.vercel.getWatchedProjects().then((projects) => {
      useVitalsStore.getState().setWatchedVercelProjects(projects);
    });

    window.vitals.onWatchedVercelProjectsChanged((projects) => {
      const store = useVitalsStore.getState();
      store.setWatchedVercelProjects(projects);
      if (store.activeVercelProject && !projects.includes(store.activeVercelProject)) {
        store.setActiveVercelProject('');
      }
    });

    // Load initial preferences
    window.vitals.getRestingMode().then((mode) => {
      useVitalsStore.setState({ restingMode: mode as any });
    });
    window.vitals.getPollingInterval().then((sec) => {
      useVitalsStore.setState({ pollingIntervalSec: sec });
    });

    // Streaks — initial fetch + live updates
    window.vitals.streaks.get().then((data: any) => {
      if (data) useVitalsStore.getState().updateStreakData(data);
    });
    window.vitals.streaks.onUpdated((data: any) => {
      useVitalsStore.getState().updateStreakData(data);
    });
  }, [setState, updateGitHubSnapshot, updateVercelSnapshot, updateSentrySnapshot, updateServiceSnapshot, setServiceError, updateConnectorStatus, clearServiceData, addAnomaly, pushNotification, markNotificationRead, setActiveIntegration]);

  // Throttle setIgnoreMouseEvents — max 1 call per 100ms
  const lastMouseEventRef = useRef(0);

  const handleMouseEnter = useCallback(() => {
    const now = Date.now();
    if (now - lastMouseEventRef.current < 100) return;
    lastMouseEventRef.current = now;
    window.vitals.setIgnoreMouseEvents(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    const now = Date.now();
    if (now - lastMouseEventRef.current < 100) return;
    lastMouseEventRef.current = now;
    window.vitals.setIgnoreMouseEvents(true);
  }, []);

  return (
    <Notch
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    />
  );
}
