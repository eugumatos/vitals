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

    // Per-beat variation: randomize key parameters each heartbeat cycle
    // so the waveform is never exactly the same twice
    let beatPeak = 12;      // R-wave height
    let beatDip = -6;       // S-wave depth
    let beatPWave = 2;      // P-wave height
    let beatTWave = 2.5;    // T-wave height
    let beatOffset = 0;     // slight horizontal shift

    function randomizeBeat() {
      beatPeak = 10 + Math.random() * 5;         // 10–15
      beatDip = -(4 + Math.random() * 4);        // -4 to -8
      beatPWave = 1.2 + Math.random() * 1.6;     // 1.2–2.8
      beatTWave = 1.5 + Math.random() * 2;       // 1.5–3.5
      beatOffset = (Math.random() - 0.5) * 0.04; // slight timing jitter
    }
    randomizeBeat();

    function ekgValue(x: number, cycleWidth: number): number {
      const t = ((x % cycleWidth) / cycleWidth) + beatOffset;
      if (t < 0 || t >= 1) return 0;
      if (t < 0.3) return 0;
      if (t < 0.35) return Math.sin((t - 0.3) / 0.05 * Math.PI) * beatPWave;
      if (t < 0.42) return 0;
      if (t < 0.45) return -(t - 0.42) / 0.03 * (beatDip * -1);
      if (t < 0.50) return beatDip + (t - 0.45) / 0.05 * (beatPeak - beatDip);
      if (t < 0.55) return beatPeak - (t - 0.50) / 0.05 * (beatPeak - beatDip);
      if (t < 0.58) return beatDip + (t - 0.55) / 0.03 * (-beatDip);
      if (t < 0.68) return 0;
      if (t < 0.78) return Math.sin((t - 0.68) / 0.10 * Math.PI) * beatTWave;
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
          randomizeBeat();
          const cc = cycleColorsRef.current;
          if (cc && cc.length > 0) {
            cycleIndex = (cycleIndex + 1) % cc.length;
            onCycleChangeRef.current?.(cycleIndex);
          }
        }
      } else if (!dataReadyRef.current && sweepX > wrapPoint) {
        sweepX = 0;
        randomizeBeat();
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
  /** Short repo name — used by companion to show which repo this slide refers to */
  repo?: string;
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
        if (!gh) break;

        // Collect all repo short names from data
        const repoSet = new Set<string>();
        for (const p of gh.prs) if (p.repo) repoSet.add(p.repo);
        for (const a of gh.actions) if (a.repo) repoSet.add(a.repo);
        for (const n of gh.notifications) if (n.repo) repoSet.add(n.repo);
        const repos = Array.from(repoSet);

        if (repos.length === 0) {
          slides.push({ id, color: colors.healthy, label: 'all clear' });
          break;
        }

        // Generate one slide per repo with its most important info
        for (const repo of repos) {
          const repoPrs = gh.prs.filter((p) => p.repo === repo);
          const repoActions = gh.actions.filter((a) => a.repo === repo);
          const repoNotifs = gh.notifications.filter((n) => n.repo === repo);
          const failedCI = repoActions.filter((a) => a.conclusion === 'failure' && isRecent(a.updatedAt)).length;
          const reviewCount = repoPrs.filter((p) => p.isReviewRequested).length;
          const unread = repoNotifs.filter((n) => n.unread).length;

          if (failedCI > 0) {
            slides.push({ id, color: colors.incident, label: `${failedCI} CI failed`, repo });
          } else if (reviewCount > 0) {
            slides.push({ id, color: colors.anomaly, label: `${reviewCount} to review`, repo });
          } else if (unread > 0) {
            slides.push({ id, color: colors.info, label: `${unread} unread`, repo });
          } else if (repoPrs.length > 0) {
            slides.push({ id, color: colors.healthy, label: `${repoPrs.length} PRs open`, repo });
          } else {
            slides.push({ id, color: colors.healthy, label: 'all clear', repo });
          }
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
      case 'supabase': {
        const snap = hoverData.supabase;
        if (!snap?.data?.projects || !Array.isArray(snap.data.projects)) break;
        slides.push({ id, color: colors.textSecondary, label: `${snap.data.projects.length} projects` });
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
        const prsNeedReview = gh.prs.filter((p) => p.isReviewRequested).length;
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
    }
  }

  return slides;
}

// --- Companion slides: complementary right-wing data paired 1:1 with activity slides ---

function extractCompanionSlides(
  activitySlides: WingSlide[],
  hoverData: HoverData,
  restingDeploy: { sha: string; time: string; status: string },
): WingSlide[] {
  return activitySlides.map((slide) => {
    switch (slide.id) {
      case 'github': {
        // Companion always shows the repo name — left wing has the info, right wing has the context
        const repo = slide.repo;
        if (repo) return { id: slide.id, color: colors.textSecondary, label: repo };
        return { id: slide.id, color: colors.textSecondary, label: '' };
      }
      case 'vercel': {
        const v = hoverData.vercel;
        if (!v || v.deployments.length === 0) return { id: slide.id, color: slide.color, label: '' };
        const d = v.deployments[0];
        const stateLabel = d.state === 'READY' ? 'ready' : d.state === 'ERROR' ? 'error' : d.state === 'BUILDING' ? 'building' : d.state.toLowerCase();
        const stateColor = d.state === 'READY' ? colors.healthy : d.state === 'ERROR' ? colors.incident : colors.anomaly;
        return { id: slide.id, color: stateColor, label: stateLabel };
      }
      case 'sentry': {
        const s = hoverData.sentry;
        if (!s) return { id: slide.id, color: slide.color, label: '' };
        const { totalErrors24h, newIssues24h } = s.stats;
        if (totalErrors24h > 100) {
          const errStr = totalErrors24h > 1000 ? `${(totalErrors24h / 1000).toFixed(1)}k` : `${totalErrors24h}`;
          return { id: slide.id, color: colors.incident, label: `${errStr}/24h` };
        }
        if (newIssues24h > 0) return { id: slide.id, color: colors.anomaly, label: `${newIssues24h} new` };
        return { id: slide.id, color: colors.healthy, label: `${s.stats.unresolvedCount} open` };
      }
      case 'openai':
      case 'anthropic': {
        const snap = hoverData[slide.id as 'openai' | 'anthropic'];
        if (!snap?.data?.usage) return { id: slide.id, color: slide.color, label: '' };
        const cost = snap.data.usage.totalCost;
        if (cost != null) {
          const costStr = cost >= 100 ? `$${Math.round(cost)}` : cost >= 1 ? `$${cost.toFixed(2)}` : `$${cost.toFixed(3)}`;
          const costColor = cost > 50 ? colors.anomaly : colors.textSecondary;
          return { id: slide.id, color: costColor, label: costStr };
        }
        return { id: slide.id, color: slide.color, label: '' };
      }
      case 'datadog': {
        const snap = hoverData.datadog;
        if (!snap?.data?.monitors || !Array.isArray(snap.data.monitors)) return { id: slide.id, color: slide.color, label: '' };
        const alerting = snap.data.monitors.filter((m: any) => m.overallState === 'Alert').length;
        const warn = snap.data.monitors.filter((m: any) => m.overallState === 'Warn').length;
        if (alerting > 0) return { id: slide.id, color: colors.incident, label: `${alerting} alert` };
        if (warn > 0) return { id: slide.id, color: colors.anomaly, label: `${warn} warn` };
        return { id: slide.id, color: colors.healthy, label: 'all ok' };
      }
      case 'supabase': {
        const snap = hoverData.supabase;
        if (!snap?.data?.stats) return { id: slide.id, color: slide.color, label: '' };
        const { healthy, unhealthy } = snap.data.stats;
        if (unhealthy > 0) return { id: slide.id, color: colors.incident, label: `${unhealthy} unhealthy` };
        return { id: slide.id, color: colors.healthy, label: `${healthy} healthy` };
      }
      default:
        return { id: slide.id, color: slide.color, label: '' };
    }
  });
}

// --- Synced dual-wing carousel: both wings rotate in lockstep ---

function GlanceCarousel({ activitySlides, companionSlides, menuBarHeight, wingWidth }: {
  activitySlides: WingSlide[];
  companionSlides: WingSlide[];
  menuBarHeight: number;
  wingWidth: number;
}) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const count = activitySlides.length;

  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % count);
        setVisible(true);
      }, 300);
    }, CAROUSEL_INTERVAL);
    return () => clearInterval(id);
  }, [count]);

  useEffect(() => {
    setIndex(0);
    setVisible(true);
  }, [count]);

  const safeIndex = index % count;
  const left = activitySlides[safeIndex];
  const right = companionSlides[safeIndex];
  if (!left) return null;

  const LeftIcon = integrationIcons[left.id];
  const usable = wingWidth - WING_PADDING * 2;

  const slideTransition = 'opacity 0.3s ease, transform 0.3s ease, filter 0.3s ease';

  return (
    <>
      {/* Left wing — activity */}
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
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            maxWidth: usable,
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(-3px)',
            filter: visible ? 'blur(0px)' : 'blur(2px)',
            transition: slideTransition,
          }}
        >
          {LeftIcon && (
            <div style={{ color: left.color, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <LeftIcon size={10} />
            </div>
          )}
          <span
            style={{
              fontSize: 11,
              color: left.color,
              fontFamily: fonts.mono,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {left.label}
          </span>
        </div>
      </div>
      {/* Right wing — companion */}
      {right && right.label && (
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
            overflow: 'hidden',
            zIndex: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              maxWidth: usable,
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(-3px)',
              filter: visible ? 'blur(0px)' : 'blur(2px)',
              transition: slideTransition,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: right.color,
                fontFamily: fonts.mono,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {right.label}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

// --- Active deploy detection ---

interface ActiveDeploy {
  source: 'github' | 'vercel';
  label: string;         // short identifier (sha or project name)
  startedAt: string;     // ISO date
  step: string;          // current build step/phase
}

/** Infer a short build step label from the last log line */
function inferStepFromLog(text: string): string {
  const t = text.toLowerCase();
  if (/cloning|clone/.test(t)) return 'cloning';
  if (/install|npm i|yarn add|pnpm i|added \d+ packages/.test(t)) return 'installing';
  if (/build|compil|webpack|vite|next build|tsc|esbuild/.test(t)) return 'compiling';
  if (/generat|static|page|prerender/.test(t)) return 'generating';
  if (/upload|deploy|output|lambda/.test(t)) return 'deploying';
  if (/optim|minif|compress/.test(t)) return 'optimizing';
  if (/lint|check|eslint|typecheck/.test(t)) return 'checking';
  if (/test|jest|vitest|mocha/.test(t)) return 'testing';
  if (/cache|cached/.test(t)) return 'caching';
  return 'building';
}

function findActiveDeploy(hoverData: HoverData, restingDeploy: { status: string; sha: string }): ActiveDeploy | null {
  // GitHub Actions in progress
  if (restingDeploy.status === 'building' && restingDeploy.sha) {
    const run = hoverData.github?.actions.find((a) => a.conclusion === null || a.status === 'in_progress');
    if (run) {
      return {
        source: 'github',
        label: run.sha,
        startedAt: run.updatedAt,
        step: run.name || 'running',
      };
    }
  }

  // Vercel deploy building
  const v = hoverData.vercel;
  if (v) {
    const building = v.deployments.find((d) => d.state === 'BUILDING' || d.state === 'QUEUED' || d.state === 'INITIALIZING');
    if (building) {
      // Determine step from state + build logs
      let step: string;
      if (building.state === 'QUEUED') {
        step = 'queued';
      } else if (building.state === 'INITIALIZING') {
        step = 'initializing';
      } else {
        // Try to infer from the latest build log
        step = 'building';
        const logs = v.logsPerProject?.[building.project];
        const logLines = logs
          ? (logs.build.length > 0 ? logs.build : logs.runtime)
          : (building.runtimeLogs || []);
        if (logLines.length > 0) {
          step = inferStepFromLog(logLines[logLines.length - 1].text);
        }
      }
      return {
        source: 'vercel',
        label: building.project,
        startedAt: building.createdAt,
        step,
      };
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

// Canvas-based beam animation — light sweep from wing A to wing C
function DeployBeamCanvas({ width, height }: { width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    let beamX = 0;
    const speed = width / 140; // ~2.3s per sweep at 60fps
    let frameId: number;
    let stopped = false;

    // Particle pool
    const particles: Array<{ x: number; y: number; vy: number; vx: number; life: number; maxLife: number }> = [];
    const bottomY = height - 1;
    const trailLen = width * 0.25;

    function draw() {
      if (stopped) return;
      ctx.clearRect(0, 0, width, height);

      // 1. Filled progress trail — thin line at bottom, from left edge to beam position
      if (beamX > 0) {
        const trailGrad = ctx.createLinearGradient(0, 0, beamX, 0);
        trailGrad.addColorStop(0, 'rgba(245, 185, 66, 0)');
        trailGrad.addColorStop(Math.max(0, 1 - trailLen / beamX), 'rgba(245, 185, 66, 0.03)');
        trailGrad.addColorStop(1, 'rgba(245, 185, 66, 0.2)');
        ctx.fillStyle = trailGrad;
        ctx.fillRect(0, bottomY - 1, beamX, 1.5);
      }

      // 2. Beam glow — bright gradient centered on beam point
      const glowWidth = 80;
      const beamGrad = ctx.createLinearGradient(beamX - glowWidth / 2, 0, beamX + glowWidth / 2, 0);
      beamGrad.addColorStop(0, 'rgba(245, 185, 66, 0)');
      beamGrad.addColorStop(0.35, 'rgba(245, 185, 66, 0.35)');
      beamGrad.addColorStop(0.5, 'rgba(245, 185, 66, 0.9)');
      beamGrad.addColorStop(0.65, 'rgba(245, 185, 66, 0.35)');
      beamGrad.addColorStop(1, 'rgba(245, 185, 66, 0)');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(beamX - glowWidth / 2, bottomY - 1.5, glowWidth, 2);

      // 3. Vertical surface glow — ambient light above beam
      const surfaceGlow = ctx.createRadialGradient(beamX, bottomY, 0, beamX, bottomY, height * 0.8);
      surfaceGlow.addColorStop(0, 'rgba(245, 185, 66, 0.08)');
      surfaceGlow.addColorStop(0.4, 'rgba(245, 185, 66, 0.03)');
      surfaceGlow.addColorStop(1, 'rgba(245, 185, 66, 0)');
      ctx.fillStyle = surfaceGlow;
      ctx.beginPath();
      ctx.arc(beamX, bottomY, height * 0.8, Math.PI, 0); // semicircle above
      ctx.fill();

      // 4. Beam point — bright center
      ctx.beginPath();
      ctx.arc(beamX, bottomY - 0.5, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245, 185, 66, 0.9)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(beamX, bottomY - 0.5, 1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 235, 190, 1)';
      ctx.fill();

      // 5. Spawn particles
      if (Math.random() < 0.35) {
        particles.push({
          x: beamX + (Math.random() - 0.5) * 6,
          y: bottomY - 2,
          vy: -(0.2 + Math.random() * 0.6),
          vx: (Math.random() - 0.5) * 0.3,
          life: 0,
          maxLife: 15 + Math.random() * 25,
        });
      }

      // 6. Draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;
        p.y += p.vy;
        p.x += p.vx;
        p.vy *= 0.96;

        if (p.life > p.maxLife) {
          particles.splice(i, 1);
          continue;
        }

        const alpha = (1 - p.life / p.maxLife) * 0.6;
        const size = 0.7 * (1 - p.life / p.maxLife);
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgb(245, 200, 100)';
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Advance beam
      beamX += speed;
      if (beamX > width + glowWidth / 2) {
        beamX = -glowWidth / 2;
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
      style={{ width, height, position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    />
  );
}

// Right wing carousel — alternates elapsed time ↔ build step
const DEPLOY_CAROUSEL_INTERVAL = 3000;

function DeployWingCarousel({ elapsed, step }: { elapsed: string; step: string }) {
  const [showStep, setShowStep] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setShowStep((prev) => !prev);
        setVisible(true);
      }, 280);
    }, DEPLOY_CAROUSEL_INTERVAL);
    return () => clearInterval(id);
  }, []);

  // Reset to time view when step changes
  useEffect(() => {
    setShowStep(false);
    setVisible(true);
  }, [step]);

  const circumference = 2 * Math.PI * 3.5;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-3px)',
        transition: 'opacity 0.28s ease, transform 0.28s ease',
      }}
    >
      {showStep ? (
        <>
          {/* Step dot indicator */}
          <div
            style={{
              width: 4,
              height: 4,
              borderRadius: '50%',
              backgroundColor: colors.anomaly,
              flexShrink: 0,
              opacity: 0.7,
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: colors.anomaly,
              fontFamily: fonts.mono,
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              opacity: 0.85,
            }}
          >
            {step}
          </span>
        </>
      ) : (
        <>
          {/* Spinning ring */}
          <svg width={10} height={10} style={{ flexShrink: 0, animation: 'vitals-deploy-ring-spin 2s linear infinite' }}>
            <circle cx={5} cy={5} r={3.5} fill="none" stroke="rgba(245,185,66,0.2)" strokeWidth={1} />
            <circle
              cx={5} cy={5} r={3.5}
              fill="none"
              stroke={colors.anomaly}
              strokeWidth={1}
              strokeDasharray={`${circumference}`}
              strokeDashoffset={`${circumference * 0.7}`}
              strokeLinecap="round"
            />
          </svg>
          <span
            style={{
              fontSize: 11,
              color: colors.anomaly,
              fontFamily: fonts.mono,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.02em',
            }}
          >
            {elapsed}
          </span>
        </>
      )}
    </div>
  );
}

// Full-width deploy animation — spans both wings with beam sweep
function ActiveDeployAnimation({ deploy, menuBarHeight, totalWidth, wingWidth }: {
  deploy: ActiveDeploy;
  menuBarHeight: number;
  totalWidth: number;
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
        width: totalWidth,
        height: menuBarHeight,
        overflow: 'hidden',
      }}
    >
      {/* Beam sweep animation across full width */}
      <DeployBeamCanvas width={totalWidth} height={menuBarHeight} />

      {/* Left wing: icon + project */}
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
          gap: 4,
          zIndex: 10,
        }}
      >
        {Icon && (
          <div style={{
            color: colors.anomaly,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            animation: 'vitals-deploy-icon-breathe 2.5s ease-in-out infinite',
          }}>
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
            opacity: 0.9,
          }}
        >
          {deploy.label}
        </span>
      </div>

      {/* Right wing: carousel — elapsed time ↔ build step */}
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
          zIndex: 10,
        }}
      >
        <DeployWingCarousel elapsed={elapsed} step={deploy.step} />
      </div>

      <style>{`
        @keyframes vitals-deploy-ring-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes vitals-deploy-icon-breathe {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
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

// --- Pulse mode: EKG is the protagonist ---
// The EKG runs free most of the time. Info flashes briefly every N cycles,
// unless something is very recent (< 2 min) — then it shows immediately.
// When info appears, the canvas mask fades the EKG at the wing edges so
// the trail dissolves right where the text begins.

const PULSE_SHOW_EVERY_N_CYCLES = 3;   // show info every 3 sweeps
const PULSE_INFO_ENTER_DELAY_MS = 150;  // slight delay so sweep is already moving when text appears
const PULSE_RECENT_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes = "very recent"
// EKG sweep speed = 1.8 px/frame @ 60fps. Visible sweep time = width / 1.8 / 60.
// Info should stay for ~80% of the visible sweep, then fade before wrap.
function calcInfoDuration(animWidth: number): number {
  const visibleSweepMs = (animWidth / 1.8 / 60) * 1000;
  return visibleSweepMs * 0.8;
}

function hasRecentData(hoverData: HoverData, connectedIds: string[]): boolean {
  const now = Date.now();
  for (const id of connectedIds) {
    switch (id) {
      case 'github': {
        const gh = hoverData.github;
        if (gh?.actions.some((a) => now - new Date(a.updatedAt).getTime() < PULSE_RECENT_THRESHOLD_MS)) return true;
        if (gh?.notifications.some((n) => n.unread && now - new Date(n.updatedAt).getTime() < PULSE_RECENT_THRESHOLD_MS)) return true;
        break;
      }
      case 'vercel': {
        const v = hoverData.vercel;
        if (v?.deployments.some((d) => now - new Date(d.createdAt).getTime() < PULSE_RECENT_THRESHOLD_MS)) return true;
        break;
      }
      case 'sentry': {
        const s = hoverData.sentry;
        if (s?.issues.some((i) => now - new Date(i.lastSeen).getTime() < PULSE_RECENT_THRESHOLD_MS)) return true;
        break;
      }
      default: break;
    }
  }
  return false;
}

function PulseMode({ activitySlides, healthSlides, companionSlides, notchWidth, menuBarHeight, wingWidth, restingExtension }: {
  activitySlides: WingSlide[];
  healthSlides: WingSlide[];
  companionSlides: WingSlide[];
  notchWidth: number;
  menuBarHeight: number;
  wingWidth: number;
  restingExtension: number;
}) {
  const animWidth = notchWidth + restingExtension;
  const hoverData = useVitalsStore((s) => s.hoverData);
  const connectors = useVitalsStore((s) => s.connectors);
  const connectedIds = useMemo(() => connectors.filter((c) => c.connected).map((c) => c.id), [connectors]);

  const allSlides = useMemo(() => {
    if (activitySlides.length > 0) return activitySlides;
    if (healthSlides.length > 0) return healthSlides;
    return [{ id: 'default', color: colors.healthy, label: '' }];
  }, [activitySlides, healthSlides]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [infoSide, setInfoSide] = useState<'left' | 'right'>('left');
  const cycleCountRef = useRef(0);
  const showCountRef = useRef(0);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const infoDuration = useMemo(() => calcInfoDuration(animWidth), [animWidth]);

  const cycleColors = useMemo(
    () => allSlides.map((s) => s.color),
    [allSlides],
  );

  const isRecent = useMemo(
    () => hasRecentData(hoverData, connectedIds),
    [hoverData, connectedIds],
  );

  const handleCycleChange = useCallback((idx: number) => {
    cycleCountRef.current++;
    setCurrentIndex(idx);

    const shouldShow = isRecent || (cycleCountRef.current % PULSE_SHOW_EVERY_N_CYCLES === 0);
    if (!shouldShow) return;

    // Alternate sides each time info appears
    showCountRef.current++;
    setInfoSide(showCountRef.current % 2 === 0 ? 'left' : 'right');

    // Slight delay so the sweep is already moving when text fades in
    if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    enterTimerRef.current = setTimeout(() => {
      setShowInfo(true);
      // Hide before the sweep wraps around
      exitTimerRef.current = setTimeout(() => {
        setShowInfo(false);
      }, infoDuration);
    }, PULSE_INFO_ENTER_DELAY_MS);
  }, [isRecent, infoDuration]);

  useEffect(() => () => {
    if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
  }, []);

  const currentSlide = allSlides[currentIndex % allSlides.length];
  const CurrentIcon = currentSlide ? integrationIcons[currentSlide.id] : null;

  // Find companion slide — use direct index since an integration can have multiple slides (one per repo)
  const activityIdx = currentIndex % allSlides.length;
  const activityMatch = activitySlides[activityIdx] || currentSlide;
  const companion = companionSlides[activityIdx] || null;

  // Decide what goes on each side based on alternation
  // 'left' layout:  left = icon + activity,  right = companion
  // 'right' layout: left = companion,        right = icon + activity
  const leftData = infoSide === 'left'
    ? { icon: CurrentIcon, label: activityMatch?.label || '', color: currentSlide?.color || colors.textSecondary, showIcon: true }
    : { icon: null, label: companion?.label || '', color: companion?.color || colors.textSecondary, showIcon: false };
  const rightData = infoSide === 'left'
    ? { icon: null, label: companion?.label || '', color: companion?.color || colors.textSecondary, showIcon: false }
    : { icon: CurrentIcon, label: activityMatch?.label || '', color: currentSlide?.color || colors.textSecondary, showIcon: true };

  const hasLeft = !!leftData.label;
  const hasRight = !!rightData.label;

  // Always-applied mask — subtle fade at wing edges so EKG naturally
  // dissolves toward the text zones. No toggling = no flash.
  const textZone = wingWidth - 4;
  const canvasMask = `linear-gradient(to right, transparent 0px, rgba(0,0,0,0.2) ${textZone * 0.4}px, black ${textZone}px, black calc(100% - ${textZone}px), rgba(0,0,0,0.2) calc(100% - ${textZone * 0.4}px), transparent 100%)`;

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
      {/* EKG canvas — always masked at wing edges */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: animWidth,
          height: menuBarHeight,
          WebkitMaskImage: canvasMask,
          maskImage: canvasMask,
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
      </div>

      {/* Left wing flash */}
      {hasLeft && (
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
            gap: 4,
            opacity: showInfo ? 0.9 : 0,
            transform: showInfo ? 'translateX(0)' : 'translateX(-4px)',
            transition: 'opacity 0.35s ease, transform 0.35s ease',
            zIndex: 10,
          }}
        >
          {leftData.showIcon && leftData.icon && (
            <div style={{ color: leftData.color, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {(() => { const I = leftData.icon; return <I size={10} />; })()}
            </div>
          )}
          <span
            style={{
              fontSize: 11,
              color: leftData.color,
              fontFamily: fonts.mono,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {leftData.label}
          </span>
        </div>
      )}

      {/* Right wing flash */}
      {hasRight && (
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
            opacity: showInfo ? 0.9 : 0,
            transform: showInfo ? 'translateX(0)' : 'translateX(4px)',
            transition: 'opacity 0.35s ease, transform 0.35s ease',
            zIndex: 10,
          }}
        >
          {rightData.showIcon && rightData.icon && (
            <div style={{ color: rightData.color, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {(() => { const I = rightData.icon; return <I size={10} />; })()}
            </div>
          )}
          <span
            style={{
              fontSize: 11,
              color: rightData.color,
              fontFamily: fonts.mono,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {rightData.label}
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

// Canvas-based completion flash — green/red sweep across full width
function DeployCompletionCanvas({ width, height, success }: { width: number; height: number; success: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    const color = success ? [52, 211, 153] : [239, 68, 68]; // green or red
    const totalFrames = 180; // ~3s at 60fps
    const sweepFrames = 60; // sweep takes 1s
    let frame = 0;
    let frameId: number;
    let stopped = false;

    function draw() {
      if (stopped) return;
      ctx.clearRect(0, 0, width, height);

      const [r, g, b] = color;

      if (frame < sweepFrames) {
        // Phase 1: Sweep from left to right
        const progress = frame / sweepFrames;
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        const sweepX = eased * (width + 80);

        // Sweep beam
        const beamGrad = ctx.createLinearGradient(sweepX - 80, 0, sweepX, 0);
        beamGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
        beamGrad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.3)`);
        beamGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.6)`);
        ctx.fillStyle = beamGrad;
        ctx.fillRect(sweepX - 80, 0, 80, height);

        // Trail behind sweep — bottom line fills up
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
        ctx.fillRect(0, height - 1.5, sweepX, 1.5);

        // Surface glow at beam point
        const glow = ctx.createRadialGradient(sweepX, height / 2, 0, sweepX, height / 2, height);
        glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.15)`);
        glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(sweepX - height, 0, height * 2, height);
      } else {
        // Phase 2: Hold with subtle pulse, then fade
        const holdFrame = frame - sweepFrames;
        const holdTotal = totalFrames - sweepFrames;
        const fadeStart = holdTotal * 0.7; // start fading at 70% of hold phase

        let alpha: number;
        if (holdFrame < fadeStart) {
          // Gentle pulse
          const pulse = Math.sin(holdFrame * 0.08) * 0.03;
          alpha = 0.15 + pulse;
        } else {
          // Fade out
          const fadeProgress = (holdFrame - fadeStart) / (holdTotal - fadeStart);
          alpha = 0.15 * (1 - fadeProgress);
        }

        // Ambient glow across full width
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fillRect(0, 0, width, height);

        // Bottom line — persists then fades
        const lineAlpha = holdFrame < fadeStart ? 0.25 : 0.25 * (1 - (holdFrame - fadeStart) / (holdTotal - fadeStart));
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${lineAlpha})`;
        ctx.fillRect(0, height - 1.5, width, 1.5);
      }

      frame++;
      if (frame < totalFrames) {
        frameId = requestAnimationFrame(draw);
      }
    }

    frameId = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      cancelAnimationFrame(frameId);
    };
  }, [width, height, success]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    />
  );
}

function DeployFlashBanner({ flash, menuBarHeight, totalWidth, wingWidth }: {
  flash: { active: boolean; success: boolean; message: string };
  menuBarHeight: number;
  totalWidth: number;
  wingWidth: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Delay text appearance to sync with sweep
    const id = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(id);
  }, []);

  const textColor = flash.success ? colors.healthy : colors.incident;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: totalWidth,
        height: menuBarHeight,
        overflow: 'hidden',
      }}
    >
      {/* Canvas sweep animation */}
      <DeployCompletionCanvas width={totalWidth} height={menuBarHeight} success={flash.success} />

      {/* Left wing: status indicator */}
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
          gap: 5,
          zIndex: 10,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(3px)',
          transition: 'opacity 0.35s ease, transform 0.35s ease',
        }}
      >
        <div style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: textColor,
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: 11,
          color: textColor,
          fontFamily: fonts.mono,
          fontWeight: 500,
          letterSpacing: '0.02em',
        }}>
          {flash.success ? 'deployed' : 'failed'}
        </span>
      </div>

      {/* Right wing: message */}
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
          zIndex: 10,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(3px)',
          transition: 'opacity 0.35s ease 0.1s, transform 0.35s ease 0.1s',
        }}
      >
        <span style={{
          fontSize: 11,
          color: textColor,
          fontFamily: fonts.mono,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          opacity: 0.8,
        }}>
          {flash.message}
        </span>
      </div>
    </div>
  );
}

// --- Welcome animation: EKG + greeting on first launch ---

const WELCOME_MESSAGES = [
  'Hello',
  'This is Vitals',
  'Always on',
];

function WelcomeAnimation({ notchWidth, menuBarHeight }: { notchWidth: number; menuBarHeight: number }) {
  const dismissWelcome = useVitalsStore((s) => s.dismissWelcome);
  const [msgIndex, setMsgIndex] = useState(0);
  const [textVisible, setTextVisible] = useState(false);
  const [phase, setPhase] = useState<'ekg' | 'text' | 'done'>('ekg');
  const wingWidth = 100; // each visible wing beside the notch
  const textRef = useRef<HTMLSpanElement>(null);
  const [textWidth, setTextWidth] = useState(0);

  // Measure text width to decide layout
  useEffect(() => {
    if (textRef.current) {
      setTextWidth(textRef.current.offsetWidth);
    }
  }, [msgIndex, phase]);

  // Phase 1: EKG plays for ~2s, then show first message
  useEffect(() => {
    const ekgTimer = setTimeout(() => {
      setPhase('text');
      setTextVisible(true);
    }, 2000);
    return () => clearTimeout(ekgTimer);
  }, []);

  // Phase 2: cycle through messages
  useEffect(() => {
    if (phase !== 'text') return;
    if (msgIndex >= WELCOME_MESSAGES.length - 1) {
      // Last message — wait then dismiss
      const timer = setTimeout(() => {
        setTextVisible(false);
        setTimeout(() => dismissWelcome(), 500);
      }, 3000);
      return () => clearTimeout(timer);
    }

    // Advance to next message
    const timer = setTimeout(() => {
      setTextVisible(false);
      setTimeout(() => {
        setMsgIndex((i) => i + 1);
        setTextVisible(true);
      }, 400);
    }, 2500);
    return () => clearTimeout(timer);
  }, [phase, msgIndex, dismissWelcome]);

  const textStyle: React.CSSProperties = {
    fontSize: 11,
    color: colors.healthy,
    fontFamily: fonts.mono,
    letterSpacing: '0.06em',
    whiteSpace: 'nowrap',
    position: 'absolute',
  };

  const fadeStyle: React.CSSProperties = {
    opacity: textVisible ? 1 : 0,
    transform: textVisible ? 'translateY(0)' : 'translateY(3px)',
    transition: 'opacity 0.5s ease, transform 0.5s ease',
  };

  // Hidden span for measuring text width
  const measurer = (
    <span
      ref={textRef}
      style={{ ...textStyle, visibility: 'hidden', position: 'fixed', top: -9999 }}
    >
      {WELCOME_MESSAGES[msgIndex]}
    </span>
  );

  // Text centered across the full layout width (left wing + notch + right wing).
  // Each wing clips its visible portion of the text.
  const fullWidth = wingWidth + notchWidth + wingWidth;
  const textLeft = (fullWidth - textWidth) / 2;

  // Single EKG spans both wings (total visible width).
  // Each wing clips its portion of the same animation.
  const ekgWidth = wingWidth * 2;

  return (
    <>
      {measurer}

      {/* Left wing */}
      <div
        style={{
          ...zoneAContainerStyle,
          width: wingWidth,
          height: menuBarHeight,
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* EKG — render full width, left wing shows left half */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: ekgWidth,
            height: menuBarHeight,
            opacity: phase === 'text' ? 0.3 : 1,
            transition: 'opacity 0.8s ease',
          }}
        >
          <VitalSignsAnimation
            width={ekgWidth}
            height={menuBarHeight}
            dataReady={false}
            onFinished={() => {}}
            color={colors.healthy}
            loop
          />
        </div>

        {/* Text portion visible in left wing */}
        {phase === 'text' && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: wingWidth,
              height: menuBarHeight,
              display: 'flex',
              alignItems: 'center',
              overflow: 'hidden',
              ...fadeStyle,
            }}
          >
            <span style={{ ...textStyle, left: textLeft }}>
              {WELCOME_MESSAGES[msgIndex]}
            </span>
          </div>
        )}
      </div>

      {/* Right wing */}
      <div
        style={{
          ...zoneCContainerStyle,
          width: wingWidth,
          height: menuBarHeight,
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* EKG — same full width, offset left so right wing shows right half */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: -wingWidth,
            width: ekgWidth,
            height: menuBarHeight,
            opacity: phase === 'text' ? 0.3 : 1,
            transition: 'opacity 0.8s ease',
          }}
        >
          <VitalSignsAnimation
            width={ekgWidth}
            height={menuBarHeight}
            dataReady={false}
            onFinished={() => {}}
            color={colors.healthy}
            loop
          />
        </div>

        {/* Text portion visible in right wing (offset to show second half) */}
        {phase === 'text' && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: wingWidth,
              height: menuBarHeight,
              display: 'flex',
              alignItems: 'center',
              overflow: 'hidden',
              ...fadeStyle,
            }}
          >
            <span style={{ ...textStyle, left: textLeft - wingWidth - notchWidth }}>
              {WELCOME_MESSAGES[msgIndex]}
            </span>
          </div>
        )}
      </div>
    </>
  );
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
  const deployFlash = useVitalsStore((s) => s.deployFlash);
  const showWelcome = useVitalsStore((s) => s.showWelcome);

  const activeAnomalies = useVitalsStore((s) => s.activeAnomalies);

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

  const streakData = useVitalsStore((s) => s.streakData);

  const companionSlides = useMemo(
    () => {
      const slides = extractCompanionSlides(activitySlides, hoverData, restingDeploy);
      // Inject streak as companion content for the first slide when streak is notable
      if (streakData && streakData.currentStreak >= 2 && slides.length > 0) {
        const streakLabel = streakData.currentStreak >= 365 ? '365+' : `${streakData.currentStreak}d`;
        const streakColor = streakData.isActiveToday ? colors.healthy : colors.textTertiary;
        // Replace the first companion slide with streak (most visible position)
        slides[0] = { id: 'streak', color: streakColor, label: `🔥 ${streakLabel}` };
      }
      return slides;
    },
    [activitySlides, hoverData, restingDeploy, streakData],
  );

  const activeDeploy = useMemo(
    () => findActiveDeploy(hoverData, restingDeploy),
    [hoverData, restingDeploy],
  );

  // When nothing is connected, show welcome or offline prompt
  if (!hasAnyConnected && isResting) {
    if (showWelcome) {
      return <WelcomeAnimation notchWidth={notchWidth} menuBarHeight={menuBarHeight} />;
    }

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

  // Deploy completion flash — canvas sweep across both wings
  if (isResting && deployFlash && deployFlash.active) {
    const totalWidth = notchWidth + restingExtension;
    return (
      <DeployFlashBanner flash={deployFlash} menuBarHeight={menuBarHeight} totalWidth={totalWidth} wingWidth={wingWidth} />
    );
  }

  // Anomaly indicator — pulsing warning/critical dot replaces normal resting content
  if (isResting && hasAnyConnected && activeAnomalies.length > 0) {
    const hasCritical = activeAnomalies.some((a) => a.severity === 'critical');
    const anomalyColor = hasCritical ? colors.incident : colors.anomaly;
    const latestAnomaly = activeAnomalies[activeAnomalies.length - 1];
    // Truncate narrative for menubar
    const shortNarrative = latestAnomaly.narrative.length > 40
      ? latestAnomaly.narrative.slice(0, 37) + '...'
      : latestAnomaly.narrative;

    return (
      <>
        <style>{`@keyframes vitals-anomaly-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
        {/* Left wing — anomaly badge */}
        <div style={{ ...zoneAContainerStyle, width: wingWidth, height: menuBarHeight }}>
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: anomalyColor,
              flexShrink: 0,
              animation: 'vitals-anomaly-pulse 1.5s ease-in-out infinite',
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: anomalyColor,
              fontFamily: fonts.mono,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {activeAnomalies.length === 1 ? shortNarrative : `${activeAnomalies.length} anomalies`}
          </span>
        </div>
        {/* Right wing — countdown + anomaly count */}
        <div style={{ ...zoneCContainerStyle, width: wingWidth, height: menuBarHeight }}>
          <ProgressRing progress={lastPolledAt ? progress : 0} fetching={fetching} />
          <span
            style={{
              fontSize: fontSize.labelSecondary,
              color: anomalyColor,
              fontVariantNumeric: 'tabular-nums',
              fontFamily: fonts.mono,
              letterSpacing: '0.02em',
            }}
          >
            {hasCritical ? 'critical' : 'warning'}
          </span>
        </div>
      </>
    );
  }

  // Active deploy — full-width beam animation across both wings (all modes)
  if (isResting && activeDeploy !== null && hasAnyConnected) {
    const totalWidth = notchWidth + restingExtension;
    return (
      <ActiveDeployAnimation
        deploy={activeDeploy}
        menuBarHeight={menuBarHeight}
        totalWidth={totalWidth}
        wingWidth={wingWidth}
      />
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
    // Pulse mode: dimmed grey EKG
    if (restingMode === 'pulse') {
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
    // Glance mode: simple silenced indicator
    return (
      <>
        <div style={{ ...zoneAContainerStyle, width: wingWidth, height: menuBarHeight }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: colors.textTertiary, flexShrink: 0, opacity: 0.4 }} />
          <span style={{ fontSize: 11, color: colors.textTertiary, fontFamily: fonts.mono }}>silent</span>
        </div>
        <div style={{ ...zoneCContainerStyle, width: wingWidth, height: menuBarHeight }}>
          <span style={{ fontSize: 11, color: colors.textTertiary, fontFamily: fonts.mono, opacity: 0.5 }}>silent</span>
        </div>
      </>
    );
  }

  // --- PULSE MODE (default): EKG cycles through integration colors + micro-data overlays ---
  if (restingMode === 'pulse' && isResting && hasAnyConnected) {
    return (
      <PulseMode
        activitySlides={activitySlides}
        healthSlides={healthSlides}
        companionSlides={companionSlides}
        notchWidth={notchWidth}
        menuBarHeight={menuBarHeight}
        wingWidth={wingWidth}
        restingExtension={restingExtension}
      />
    );
  }

  // --- GLANCE MODE: synced dual-wing carousel — activity left, companion right ---

  if (activitySlides.length > 0) {
    return (
      <GlanceCarousel
        activitySlides={activitySlides}
        companionSlides={companionSlides}
        menuBarHeight={menuBarHeight}
        wingWidth={wingWidth}
      />
    );
  }

  // No data at all — shouldn't happen with connected integrations, but safe fallback
  return null;
}
