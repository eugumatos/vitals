import { useEffect, useCallback } from 'react';
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
        onSnapshot: (callback: (snapshot: any) => void) => void;
        onError: (callback: (error: string) => void) => void;
      };
      sentry: {
        setToken: (token: string) => Promise<{ success: boolean; error?: string }>;
        disconnect: () => Promise<{ success: boolean }>;
        getSnapshot: () => Promise<{ success: boolean; data?: any; error?: string }>;
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
      posthog: {
        setToken: (token: string) => Promise<{ success: boolean; error?: string }>;
        disconnect: () => Promise<{ success: boolean }>;
        getSnapshot: () => Promise<{ success: boolean; data?: any; error?: string }>;
        onSnapshot: (callback: (snapshot: any) => void) => void;
        onError: (callback: (error: string) => void) => void;
      };
      segment: {
        setToken: (token: string) => Promise<{ success: boolean; error?: string }>;
        disconnect: () => Promise<{ success: boolean }>;
        getSnapshot: () => Promise<{ success: boolean; data?: any; error?: string }>;
        onSnapshot: (callback: (snapshot: any) => void) => void;
        onError: (callback: (error: string) => void) => void;
      };
      chrome: {
        setPort: (port: string) => Promise<{ success: boolean; error?: string }>;
        disconnect: () => Promise<{ success: boolean }>;
        getSnapshot: () => Promise<{ success: boolean; data?: any; error?: string }>;
        onSnapshot: (callback: (snapshot: any) => void) => void;
        onError: (callback: (error: string) => void) => void;
      };
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
  const setGeometry = useGeometryStore((s) => s.setGeometry);

  useEffect(() => {
    window.vitals.getScreenGeometry().then(setGeometry);

    window.vitals.onStateChange((state: string) => {
      setState(state as VitalsState);
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

    // Subscribe to the 5 remaining services
    const services = ['openai', 'anthropic', 'datadog', 'posthog', 'segment', 'chrome'] as const;
    for (const service of services) {
      window.vitals[service]?.onSnapshot((snapshot: any) => {
        updateServiceSnapshot(service, snapshot.data);
      });
      window.vitals[service]?.onError((error: string) => {
        console.error(`${service} adapter error:`, error);
        setServiceError(service, error);
      });
    }

    window.vitals.getConnectorStatus().then((status) => {
      updateConnectorStatus(status);
    });
  }, [setState, updateGitHubSnapshot, updateVercelSnapshot, updateSentrySnapshot, updateServiceSnapshot, setServiceError, updateConnectorStatus]);

  const handleMouseEnter = useCallback(() => {
    window.vitals.setIgnoreMouseEvents(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    window.vitals.setIgnoreMouseEvents(true);
  }, []);

  return (
    <Notch
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    />
  );
}
