import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useVitalsStore } from '../store/useVitalsStore';
import { useGeometryStore } from '../store/useGeometryStore';
import { colors, fontSize, fonts } from '../lib/design-tokens';
import { integrationIcons } from './NotchHeader';
import type { HoverData } from '../store/types';

function usePollingCountdown() {
  const lastPolledAt = useVitalsStore((s) => s.lastPolledAt);
  const intervalSec = useVitalsStore((s) => s.pollingIntervalSec);
  const state = useVitalsStore((s) => s.state);
  const [remaining, setRemaining] = useState(intervalSec);
  const [progress, setProgress] = useState(0);
  const [fetching, setFetching] = useState(false);

  const isResting = state === 'resting';

  useEffect(() => {
    if (!lastPolledAt) {
      setRemaining(intervalSec);
      setProgress(0);
      return;
    }

    // Only run the interval when in resting state (visible countdown)
    if (!isResting) return;

    const update = () => {
      const elapsed = (Date.now() - lastPolledAt.getTime()) / 1000;
      const left = Math.max(0, intervalSec - elapsed);
      setRemaining(Math.ceil(left));
      setFetching(left <= 0);
      setProgress(left <= 0 ? 1 : Math.min(1, elapsed / intervalSec));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lastPolledAt, intervalSec, isResting]);

  return { remaining, progress, fetching };
}

function formatCountdown(sec: number): string {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m${sec % 60 > 0 ? `${sec % 60}s` : ''}`;
}

// Circular progress arc around a tiny ring
const ringBgStyle: React.CSSProperties = { transition: 'none' };
const ringProgressBaseStyle: React.CSSProperties = { transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease' };
const ringProgressFetchingStyle: React.CSSProperties = { transition: 'none' };

function ProgressRing({ progress, size = 12, fetching = false }: { progress: number; size?: number; fetching?: boolean }) {
  const stroke = 1.4;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - progress);

  return (
    <svg width={size} height={size} style={{ flexShrink: 0, animation: fetching ? 'vitals-spin 1.2s linear infinite' : 'none' }}>
      <style>{`@keyframes vitals-spin { to { transform: rotate(360deg); } }`}</style>
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={stroke}
      />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={fetching ? colors.healthy : 'rgba(255,255,255,0.6)'}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={fetching ? circumference * 0.7 : offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={fetching ? ringProgressFetchingStyle : ringProgressBaseStyle}
      />
      {!fetching && (
        <circle
          cx={cx} cy={cy}
          r={1.2}
          fill="rgba(255,255,255,0.4)"
        />
      )}
    </svg>
  );
}

// EKG / vital signs heartbeat animation for loading state
function VitalSignsAnimation({ width, height, dataReady, onFinished, color, loop, cycleColors, onCycleChange }: {
  width: number;
  height: number;
  dataReady: boolean;
  onFinished: () => void;
  color?: string;
  loop?: boolean;
  /** Array of colors to cycle through — one per sweep. Overrides `color`. */
  cycleColors?: string[];
  /** Called when the sweep wraps and advances to the next cycle index. */
  onCycleChange?: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataReadyRef = useRef(dataReady);
  dataReadyRef.current = dataReady;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  const colorRef = useRef(color || colors.healthy);
  colorRef.current = color || colors.healthy;
  const loopRef = useRef(loop ?? false);
  loopRef.current = loop ?? false;
  const cycleColorsRef = useRef(cycleColors);
  cycleColorsRef.current = cycleColors;
  const onCycleChangeRef = useRef(onCycleChange);
  onCycleChangeRef.current = onCycleChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maybeCtx = canvas.getContext('2d');
    if (!maybeCtx) return;
    const ctx = maybeCtx;

    const dpr = window.devicePixelRatio || 2;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const lineY = height / 2;
    const speed = 1.8;
    let sweepX = 0;
    let frameId: number;
    let finishing = false;
    let stopped = false;
    let cycleIndex = 0;

    function getCurrentColor(): string {
      const cc = cycleColorsRef.current;
      if (cc && cc.length > 0) return cc[cycleIndex % cc.length];
      return colorRef.current;
    }

    function ekgValue(x: number, cycleWidth: number): number {
      const t = (x % cycleWidth) / cycleWidth;
      if (t < 0.3) return 0;
      if (t < 0.35) return Math.sin((t - 0.3) / 0.05 * Math.PI) * 2;
      if (t < 0.42) return 0;
      if (t < 0.45) return -(t - 0.42) / 0.03 * 3;
      if (t < 0.50) return -3 + (t - 0.45) / 0.05 * 15;
      if (t < 0.55) return 12 - (t - 0.50) / 0.05 * 18;
      if (t < 0.58) return -6 + (t - 0.55) / 0.03 * 6;
      if (t < 0.68) return 0;
      if (t < 0.78) return Math.sin((t - 0.68) / 0.10 * Math.PI) * 2.5;
      return 0;
    }

    const cycleWidth = 120;
    const amplitude = (height - 4) / 2 / 12;
    const trailLen = width * 0.85;

    function draw() {
      if (stopped) return;
      const c = getCurrentColor();
      ctx.clearRect(0, 0, width, height);

      if (dataReadyRef.current && sweepX > width && !finishing) {
        finishing = true;
      }

      if (finishing && sweepX > width + trailLen) {
        onFinishedRef.current();
        return;
      }

      ctx.lineWidth = 1.2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      for (let x = 1; x < width; x++) {
        const distBehindSweep = sweepX - x;
        if (distBehindSweep < 0 || distBehindSweep > trailLen) continue;

        const age = distBehindSweep / trailLen;
        const alpha = Math.max(0, 0.7 * (1 - age * age));
        if (alpha < 0.02) continue;

        const prevVal = ekgValue(x - 1, cycleWidth);
        const val = ekgValue(x, cycleWidth);
        const prevY = lineY - prevVal * amplitude;
        const y = lineY - val * amplitude;

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.moveTo(x - 1, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      if (sweepX <= width) {
        const dotVal = ekgValue(sweepX, cycleWidth);
        const dotY = lineY - dotVal * amplitude;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(sweepX, dotY, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(sweepX, dotY, 4, 0, Math.PI * 2);
        const glow = ctx.createRadialGradient(sweepX, dotY, 0, sweepX, dotY, 4);
        const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
        glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.4)`);
        glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = glow;
        ctx.fill();
      }

      sweepX += speed;
      const wrapPoint = width + trailLen;
      if (loopRef.current) {
        if (sweepX > wrapPoint) {
          sweepX = 0;
          const cc = cycleColorsRef.current;
          if (cc && cc.length > 0) {
            cycleIndex = (cycleIndex + 1) % cc.length;
            onCycleChangeRef.current?.(cycleIndex);
          }
        }
      } else if (!dataReadyRef.current && sweepX > wrapPoint) {
        sweepX = 0;
      }

      frameId = requestAnimationFrame(draw);
    }

    frameId = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      cancelAnimationFrame(frameId);
    };
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        position: 'absolute',
        top: 0,
        left: 0,
      }}
    />
  );
}

// --- Slide types shared by both wings ---

interface WingSlide {
  id: string;
  color: string;
  label: string;
}

// --- Zone A: recent activity per integration ---

function extractActivitySlides(
  hoverData: HoverData,
  connectedIds: string[],
  restingDeploy: { sha: string; time: string; status: string },
): WingSlide[] {
  const slides: WingSlide[] = [];

  for (const id of connectedIds) {
    switch (id) {
      case 'github': {
        const gh = hoverData.github;
        if (restingDeploy.sha) {
          const c = restingDeploy.status === 'failure' ? colors.incident : restingDeploy.status === 'success' ? colors.healthy : colors.anomaly;
          slides.push({ id, color: c, label: `${restingDeploy.sha} ${restingDeploy.time}` });
        } else if (gh && gh.commits.length > 0) {
          slides.push({ id, color: colors.textSecondary, label: `${gh.commits[0].sha} ${formatTimeAgo(gh.commits[0].date)}` });
        }
        break;
      }
      case 'vercel': {
        const v = hoverData.vercel;
        if (!v || v.deployments.length === 0) break;
        const d = v.deployments[0];
        const stateColor = d.state === 'READY' ? colors.healthy : d.state === 'ERROR' ? colors.incident : colors.anomaly;
        const ago = d.readyAt ? formatTimeAgo(d.readyAt) : formatTimeAgo(d.createdAt);
        slides.push({ id, color: stateColor, label: `${d.project} ${ago}` });
        break;
      }
      case 'sentry': {
        const s = hoverData.sentry;
        if (!s) break;
        if (s.issues.length > 0) {
          const latest = s.issues[0];
          slides.push({ id, color: latest.level === 'error' ? colors.incident : colors.anomaly, label: truncate(latest.title, 10) });
        } else {
          slides.push({ id, color: colors.healthy, label: '0 issues' });
        }
        break;
      }
      case 'openai':
      case 'anthropic': {
        const snap = hoverData[id];
        if (!snap?.data?.usage) break;
        const u = snap.data.usage;
        const reqs = u.totalRequests;
        if (reqs != null) {
          slides.push({ id, color: colors.textSecondary, label: `${reqs > 1000 ? `${(reqs / 1000).toFixed(1)}k` : reqs} calls` });
        }
        break;
      }
      case 'datadog': {
        const snap = hoverData.datadog;
        if (!snap?.data?.monitors || !Array.isArray(snap.data.monitors)) break;
        const total = snap.data.monitors.length;
        slides.push({ id, color: colors.textSecondary, label: `${total} monitors` });
        break;
      }
      case 'posthog': {
        const snap = hoverData.posthog;
        if (!snap?.data) break;
        const events = snap.data.events;
        if (Array.isArray(events)) {
          slides.push({ id, color: colors.textSecondary, label: `${events.length} events` });
        }
        break;
      }
      case 'segment': {
        const snap = hoverData.segment;
        if (!snap?.data?.sources || !Array.isArray(snap.data.sources)) break;
        slides.push({ id, color: colors.textSecondary, label: `${snap.data.sources.length} sources` });
        break;
      }
      case 'chrome': {
        const snap = hoverData.chrome;
        if (!snap?.data) break;
        const logs = snap.data.logs;
        if (Array.isArray(logs)) {
          slides.push({ id, color: colors.textSecondary, label: `${logs.length} logs` });
        }
        break;
      }
    }
  }

  return slides;
}

function truncate(str: string, maxChars: number): string {
  return str.length > maxChars ? str.slice(0, maxChars) + '…' : str;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// --- Zone C: health status per integration ---
// Only consider recent data as "active" — older items are history, not current state.

const RECENT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function isRecent(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() < RECENT_WINDOW_MS;
}

function extractHealthSlides(hoverData: HoverData, connectedIds: string[]): WingSlide[] {
  const slides: WingSlide[] = [];

  for (const id of connectedIds) {
    switch (id) {
      case 'github': {
        const gh = hoverData.github;
        if (!gh) break;
        // Only count failures from recent runs — old failures are not current state
        const recentActions = gh.actions.filter((a) => isRecent(a.updatedAt));
        const failedActions = recentActions.filter((a) => a.conclusion === 'failure').length;
        const inProgress = recentActions.filter((a) => a.conclusion === null || a.status === 'in_progress').length;
        const prsNeedReview = gh.prs.filter((p) => p.status === 'needs_review').length;
        if (failedActions > 0) {
          slides.push({ id, color: colors.incident, label: `${failedActions} failed` });
        } else if (inProgress > 0) {
          slides.push({ id, color: colors.anomaly, label: `${inProgress} running` });
        } else if (prsNeedReview > 0) {
          slides.push({ id, color: colors.anomaly, label: `${prsNeedReview} review` });
        }
        break;
      }
      case 'vercel': {
        const v = hoverData.vercel;
        if (!v) break;
        // Only recent deploys reflect current state
        const recent = v.deployments.filter((d) => isRecent(d.createdAt));
        const errorDeploys = recent.filter((d) => d.state === 'ERROR' || d.state === 'CANCELED').length;
        const building = recent.filter((d) => d.state === 'BUILDING' || d.state === 'QUEUED').length;
        if (errorDeploys > 0) {
          slides.push({ id, color: colors.incident, label: `${errorDeploys} error` });
        } else if (building > 0) {
          slides.push({ id, color: colors.anomaly, label: `${building} building` });
        }
        break;
      }
      case 'sentry': {
        const s = hoverData.sentry;
        if (!s) break;
        const { totalErrors24h, newIssues24h } = s.stats;
        if (totalErrors24h > 100) {
          slides.push({ id, color: colors.incident, label: `${totalErrors24h > 1000 ? `${(totalErrors24h / 1000).toFixed(1)}k` : totalErrors24h} err/24h` });
        } else if (newIssues24h > 0) {
          slides.push({ id, color: colors.anomaly, label: `${newIssues24h} new` });
        }
        break;
      }
      case 'openai':
      case 'anthropic': {
        const snap = hoverData[id];
        if (!snap?.data) break;
        const usage = snap.data.usage;
        if (usage?.totalCost != null && usage.totalCost > 50) {
          const costStr = usage.totalCost >= 100 ? `$${Math.round(usage.totalCost)}` : `$${usage.totalCost.toFixed(2)}`;
          slides.push({ id, color: colors.anomaly, label: costStr });
        }
        break;
      }
      case 'datadog': {
        const snap = hoverData.datadog;
        if (!snap?.data) break;
        const monitors = snap.data.monitors;
        if (Array.isArray(monitors)) {
          const alerting = monitors.filter((m: any) => m.overallState === 'Alert').length;
          const warn = monitors.filter((m: any) => m.overallState === 'Warn').length;
          if (alerting > 0) {
            slides.push({ id, color: colors.incident, label: `${alerting} alert` });
          } else if (warn > 0) {
            slides.push({ id, color: colors.anomaly, label: `${warn} warn` });
          }
        }
        break;
      }
      case 'chrome': {
        const snap = hoverData.chrome;
        if (!snap?.data) break;
        const errors = snap.data.errors;
        if (Array.isArray(errors) && errors.length > 0) {
          slides.push({ id, color: colors.incident, label: `${errors.length} err` });
        }
        break;
      }
    }
  }

  return slides;
}

// --- Active deploy detection ---

interface ActiveDeploy {
  source: 'github' | 'vercel';
  label: string;         // short identifier (sha or project name)
  startedAt: string;     // ISO date
}

function findActiveDeploy(hoverData: HoverData, restingDeploy: { status: string; sha: string }): ActiveDeploy | null {
  // GitHub Actions in progress
  if (restingDeploy.status === 'building' && restingDeploy.sha) {
    const run = hoverData.github?.actions.find((a) => a.conclusion === null || a.status === 'in_progress');
    if (run) {
      return { source: 'github', label: run.sha, startedAt: run.updatedAt };
    }
  }

  // Vercel deploy building
  const v = hoverData.vercel;
  if (v) {
    const building = v.deployments.find((d) => d.state === 'BUILDING' || d.state === 'QUEUED');
    if (building) {
      return { source: 'vercel', label: building.project, startedAt: building.createdAt };
    }
  }

  return null;
}

function useElapsedTime(startedAt: string | null) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!startedAt) return;
    const update = () => {
      const diff = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      setElapsed(m > 0 ? `${m}m${String(s).padStart(2, '0')}s` : `${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}

function ActiveDeployBanner({ deploy, menuBarHeight, wingWidth }: {
  deploy: ActiveDeploy;
  menuBarHeight: number;
  wingWidth: number;
}) {
  const elapsed = useElapsedTime(deploy.startedAt);
  const Icon = integrationIcons[deploy.source];

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: wingWidth,
        height: menuBarHeight,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: WING_PADDING,
        boxSizing: 'border-box',
        overflow: 'hidden',
        zIndex: 10,
        gap: 4,
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: colors.anomaly,
          flexShrink: 0,
          animation: 'vitals-deploy-pulse 1.5s ease-in-out infinite',
        }}
      />
      {Icon && (
        <div style={{ color: colors.anomaly, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <Icon size={10} />
        </div>
      )}
      <span
        style={{
          fontSize: 11,
          color: colors.anomaly,
          fontFamily: fonts.mono,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {elapsed}
      </span>
      <style>{`@keyframes vitals-deploy-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}

const CAROUSEL_INTERVAL = 4000;
const WING_PADDING = 10;

function WingCarousel({ slides, menuBarHeight, wingWidth, align }: {
  slides: WingSlide[];
  menuBarHeight: number;
  wingWidth: number;
  align: 'left' | 'right';
}) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % slides.length);
        setVisible(true);
      }, 300);
    }, CAROUSEL_INTERVAL);
    return () => clearInterval(id);
  }, [slides.length]);

  useEffect(() => {
    setIndex(0);
    setVisible(true);
  }, [slides.length]);

  const safeIndex = index % slides.length;
  const slide = slides[safeIndex];
  if (!slide) return null;

  const Icon = integrationIcons[slide.id];
  const usableWidth = wingWidth - WING_PADDING * 2;
  const isLeft = align === 'left';

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        [isLeft ? 'left' : 'right']: 0,
        width: wingWidth,
        height: menuBarHeight,
        display: 'flex',
        alignItems: isLeft ? 'center' : 'center',
        justifyContent: isLeft ? 'flex-start' : 'flex-end',
        [isLeft ? 'paddingLeft' : 'paddingRight']: WING_PADDING,
        boxSizing: 'border-box',
        overflow: 'hidden',
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          maxWidth: usableWidth,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(-3px)',
          transition: 'opacity 0.3s ease, transform 0.3s ease',
        }}
      >
        {Icon && (
          <div style={{ color: slide.color, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <Icon size={10} />
          </div>
        )}
        <span
          style={{
            fontSize: 11,
            color: slide.color,
            fontFamily: fonts.mono,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {slide.label}
        </span>
      </div>
    </div>
  );
}

const zoneAContainerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  paddingLeft: 10,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  zIndex: 10,
  overflow: 'hidden',
  boxSizing: 'border-box',
};

const zoneCContainerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  paddingRight: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 5,
  zIndex: 10,
  overflow: 'hidden',
  boxSizing: 'border-box',
};

// --- Vitals mode: EKG per integration with end-of-sweep label ---

function VitalsMode({ healthSlides, notchWidth, menuBarHeight, wingWidth }: {
  healthSlides: WingSlide[];
  notchWidth: number;
  menuBarHeight: number;
  wingWidth: number;
}) {
  const animWidth = notchWidth + 200;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showLabel, setShowLabel] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build per-integration color array for the EKG
  const cycleColors = useMemo(
    () => healthSlides.length > 0 ? healthSlides.map((s) => s.color) : [colors.healthy],
    [healthSlides],
  );

  const handleCycleChange = useCallback((idx: number) => {
    // Show label briefly at end of each sweep (the label is for the PREVIOUS integration)
    setShowLabel(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setShowLabel(false);
      // Update index after label fades so the label shows the one that just swept
      setTimeout(() => setCurrentIndex(idx), 150);
    }, 1200);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const slide = healthSlides[currentIndex % healthSlides.length];
  const Icon = slide ? integrationIcons[slide.id] : null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: animWidth,
        height: menuBarHeight,
        overflow: 'hidden',
      }}
    >
      <VitalSignsAnimation
        width={animWidth}
        height={menuBarHeight}
        dataReady={false}
        onFinished={() => {}}
        cycleColors={cycleColors}
        onCycleChange={handleCycleChange}
        loop
      />
      {/* End-of-sweep label overlay — fades in on right wing */}
      {slide && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: wingWidth,
            height: menuBarHeight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: WING_PADDING,
            boxSizing: 'border-box',
            gap: 4,
            opacity: showLabel ? 1 : 0,
            transform: showLabel ? 'translateX(0)' : 'translateX(6px)',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
            zIndex: 10,
          }}
        >
          {Icon && (
            <div style={{ color: slide.color, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <Icon size={10} />
            </div>
          )}
          <span
            style={{
              fontSize: 11,
              color: slide.color,
              fontFamily: fonts.mono,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {slide.label}
          </span>
        </div>
      )}
    </div>
  );
}

// --- Periodic silence check ---
function useSilenceCheck() {
  const isSilenced = useVitalsStore((s) => s.isSilenced);

  useEffect(() => {
    let active = true;
    const check = () => {
      if (!active) return;
      window.vitals.isSilenced().then((silenced) => {
        if (active) useVitalsStore.setState({ isSilenced: silenced });
      }).catch(() => {});
    };
    check();
    const id = setInterval(check, 60_000); // re-check every minute
    return () => { active = false; clearInterval(id); };
  }, []);

  return isSilenced;
}

export function ZoneCIndicator() {
  const { restingDeploy, connectors, hoverData } = useVitalsStore();
  const { remaining, progress, fetching } = usePollingCountdown();
  const { menuBarHeight, notchWidth } = useGeometryStore();
  const lastPolledAt = useVitalsStore((s) => s.lastPolledAt);
  const state = useVitalsStore((s) => s.state);
  const setState = useVitalsStore((s) => s.setState);
  const restingMode = useVitalsStore((s) => s.restingMode);
  const isSilenced = useSilenceCheck();

  const isResting = state === 'resting';
  const [animationDone, setAnimationDone] = useState(false);
  const connectedIds = connectors.filter((c) => c.connected).map((c) => c.id);
  const hasAnyConnected = connectedIds.length > 0;
  const showAnimation = !animationDone && isResting && hasAnyConnected;

  // Each wing = half of the extension beyond the physical notch
  const restingExtension = isSilenced ? 130 : 200;
  const wingWidth = restingExtension / 2;

  const connectedKey = connectedIds.join(',');
  const activitySlides = useMemo(
    () => extractActivitySlides(hoverData, connectedIds, restingDeploy),
    [hoverData, connectedKey, restingDeploy],
  );
  const healthSlides = useMemo(
    () => extractHealthSlides(hoverData, connectedIds),
    [hoverData, connectedKey],
  );

  const activeDeploy = useMemo(
    () => findActiveDeploy(hoverData, restingDeploy),
    [hoverData, restingDeploy],
  );

  const showDeployBanner = isResting && activeDeploy !== null;
  const showLeftCarousel = isResting && restingMode === 'carousel' && !showDeployBanner && activitySlides.length > 1;
  const showRightCarousel = isResting && restingMode === 'carousel' && connectedIds.length > 1 && healthSlides.length > 0;

  // When nothing is connected, show a prompt in the visible wing areas
  if (!hasAnyConnected && isResting) {
    return (
      <>
        {/* Zone A — left wing */}
        <div style={{ ...zoneAContainerStyle, width: wingWidth, height: menuBarHeight }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: colors.textTertiary,
              flexShrink: 0,
              opacity: 0.5,
            }}
          />
          <span
            style={{
              fontSize: fontSize.labelSecondary,
              color: colors.textTertiary,
              fontFamily: fonts.mono,
            }}
          >
            offline
          </span>
        </div>
        {/* Zone C — right wing: clickable setup hint */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setState('settings');
          }}
          style={{
            ...zoneCContainerStyle,
            width: wingWidth,
            height: menuBarHeight,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: fontSize.labelSecondary,
            color: colors.action,
            fontFamily: fonts.mono,
            letterSpacing: '0.02em',
          }}
        >
          setup →
        </button>
      </>
    );
  }

  // Initial load animation — always plays once regardless of mode
  if (showAnimation) {
    const animWidth = notchWidth + 200;
    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: animWidth,
          height: menuBarHeight,
          overflow: 'hidden',
        }}
      >
        <VitalSignsAnimation
          width={animWidth}
          height={menuBarHeight}
          dataReady={!!lastPolledAt}
          onFinished={() => setAnimationDone(true)}
        />
      </div>
    );
  }

  // --- SILENCED: muted display during quiet hours ---
  if (isSilenced && isResting && hasAnyConnected) {
    const silenceColor = 'rgba(255,255,255,0.20)';
    // In vitals mode, show a dimmed grey EKG
    if (restingMode === 'vitals') {
      const animWidth = notchWidth + restingExtension;
      return (
        <div style={{ position: 'absolute', top: 0, left: 0, width: animWidth, height: menuBarHeight, overflow: 'hidden' }}>
          <VitalSignsAnimation width={animWidth} height={menuBarHeight} dataReady={false} onFinished={() => {}} color={silenceColor} loop />
          <div style={{ ...zoneCContainerStyle, width: wingWidth, height: menuBarHeight, opacity: 0.5 }}>
            <span style={{ fontSize: 11, color: colors.textTertiary, fontFamily: fonts.mono }}>silent</span>
          </div>
        </div>
      );
    }
    // Other modes: simple silenced indicator
    return (
      <>
        <div style={{ ...zoneAContainerStyle, width: wingWidth, height: menuBarHeight }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: colors.textTertiary, flexShrink: 0, opacity: 0.4 }} />
          <span style={{ fontSize: 11, color: colors.textTertiary, fontFamily: fonts.mono }}>silent</span>
        </div>
        <div style={{ ...zoneCContainerStyle, width: wingWidth, height: menuBarHeight }}>
          <ProgressRing progress={lastPolledAt ? progress : 0} fetching={fetching} />
          <span style={{ fontSize: fontSize.labelSecondary, color: colors.textTertiary, fontVariantNumeric: 'tabular-nums', fontFamily: fonts.mono, letterSpacing: '0.02em' }}>
            {!lastPolledAt ? '—' : fetching ? 'sync' : formatCountdown(remaining)}
          </span>
        </div>
      </>
    );
  }

  // --- VITALS MODE: EKG cycles through each integration's color + end-of-sweep label ---
  if (restingMode === 'vitals' && isResting && hasAnyConnected) {
    return (
      <VitalsMode
        healthSlides={healthSlides}
        notchWidth={notchWidth}
        menuBarHeight={menuBarHeight}
        wingWidth={wingWidth}
      />
    );
  }

  // --- FIXED MODE: polling countdown left + last sync right ---
  if (restingMode === 'fixed' && isResting && hasAnyConnected) {
    return (
      <>
        {/* Left: last sync time */}
        <div style={{ ...zoneAContainerStyle, width: wingWidth, height: menuBarHeight }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: lastPolledAt ? colors.healthy : colors.textTertiary,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: colors.textSecondary,
              fontFamily: fonts.mono,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
            }}
          >
            {lastPolledAt ? `synced` : '—'}
          </span>
        </div>
        {/* Right: polling countdown */}
        <div style={{ ...zoneCContainerStyle, width: wingWidth, height: menuBarHeight }}>
          <ProgressRing progress={lastPolledAt ? progress : 0} fetching={fetching} />
          <span
            style={{
              fontSize: fontSize.labelSecondary,
              color: colors.textSecondary,
              fontVariantNumeric: 'tabular-nums',
              fontFamily: fonts.mono,
              letterSpacing: '0.02em',
            }}
          >
            {!lastPolledAt ? '—' : fetching ? 'sync' : formatCountdown(remaining)}
          </span>
        </div>
      </>
    );
  }

  // --- CAROUSEL MODE (default) ---

  // Single integration fallback for Zone A
  const singleActivity = activitySlides[0];
  const singleIcon = singleActivity ? integrationIcons[singleActivity.id] : null;

  return (
    <>
      {/* Zone A — left: deploy banner > activity carousel > single */}
      {showDeployBanner ? (
        <ActiveDeployBanner deploy={activeDeploy!} menuBarHeight={menuBarHeight} wingWidth={wingWidth} />
      ) : showLeftCarousel ? (
        <WingCarousel slides={activitySlides} menuBarHeight={menuBarHeight} wingWidth={wingWidth} align="left" />
      ) : singleActivity ? (
        <div style={{ ...zoneAContainerStyle, width: wingWidth, height: menuBarHeight }}>
          {singleIcon && (
            <div style={{ color: singleActivity.color, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {(() => { const I = singleIcon; return <I size={10} />; })()}
            </div>
          )}
          <span
            style={{
              fontSize: 11,
              color: singleActivity.color,
              fontFamily: fonts.mono,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {singleActivity.label}
          </span>
        </div>
      ) : null}

      {/* Zone C — right: health carousel or polling countdown */}
      {showRightCarousel ? (
        <WingCarousel slides={healthSlides} menuBarHeight={menuBarHeight} wingWidth={wingWidth} align="right" />
      ) : (
        <div
          style={{ ...zoneCContainerStyle, width: wingWidth, height: menuBarHeight }}
        >
          <ProgressRing progress={lastPolledAt ? progress : 0} fetching={fetching} />
          <span
            style={{
              fontSize: fontSize.labelSecondary,
              color: colors.textSecondary,
              fontVariantNumeric: 'tabular-nums',
              fontFamily: fonts.mono,
              letterSpacing: '0.02em',
            }}
          >
            {!lastPolledAt ? '—' : fetching ? 'sync' : formatCountdown(remaining)}
          </span>
        </div>
      )}
    </>
  );
}
