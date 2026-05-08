import { useState, useEffect, useRef } from 'react';
import { useVitalsStore } from '../store/useVitalsStore';
import { useGeometryStore } from '../store/useGeometryStore';
import { colors, fontSize, fonts } from '../lib/design-tokens';

function usePollingCountdown() {
  const lastPolledAt = useVitalsStore((s) => s.lastPolledAt);
  const intervalSec = useVitalsStore((s) => s.pollingIntervalSec);
  const [remaining, setRemaining] = useState(intervalSec);
  const [progress, setProgress] = useState(0); // 0 → 1
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!lastPolledAt) {
      setRemaining(intervalSec);
      setProgress(0);
      return;
    }
    const update = () => {
      const elapsed = (Date.now() - lastPolledAt.getTime()) / 1000;
      const left = Math.max(0, intervalSec - elapsed);
      setRemaining(Math.ceil(left));
      setFetching(left <= 0);
      // When fetching, keep progress at 1 (full ring)
      setProgress(left <= 0 ? 1 : Math.min(1, elapsed / intervalSec));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lastPolledAt, intervalSec]);

  return { remaining, progress, fetching };
}

function formatCountdown(sec: number): string {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m${sec % 60 > 0 ? `${sec % 60}s` : ''}`;
}

// Circular progress arc around a tiny ring
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
      {/* background ring */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={stroke}
      />
      {/* progress arc */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={fetching ? colors.healthy : 'rgba(255,255,255,0.6)'}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={fetching ? circumference * 0.7 : offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: fetching ? 'none' : 'stroke-dashoffset 1s linear' }}
      />
      {/* center dot */}
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
function VitalSignsAnimation({ width, height, dataReady, onFinished }: {
  width: number;
  height: number;
  dataReady: boolean;
  onFinished: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataReadyRef = useRef(dataReady);
  dataReadyRef.current = dataReady;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

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
    let finishing = false; // true once data arrived and dot passed the right edge

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
      ctx.clearRect(0, 0, width, height);

      // When data is ready and dot has passed right edge, start finishing
      if (dataReadyRef.current && sweepX > width && !finishing) {
        finishing = true;
      }

      // If finishing, check if trail has fully faded (sweepX far enough past width)
      if (finishing && sweepX > width + trailLen) {
        onFinishedRef.current();
        return; // stop drawing
      }

      // Draw trace segments with fading alpha
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
        ctx.strokeStyle = colors.healthy;
        ctx.beginPath();
        ctx.moveTo(x - 1, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      // Bright dot at sweep position
      if (sweepX <= width) {
        const dotVal = ekgValue(sweepX, cycleWidth);
        const dotY = lineY - dotVal * amplitude;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(sweepX, dotY, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = colors.healthy;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(sweepX, dotY, 4, 0, Math.PI * 2);
        const glow = ctx.createRadialGradient(sweepX, dotY, 0, sweepX, dotY, 4);
        glow.addColorStop(0, 'rgba(52, 211, 153, 0.4)');
        glow.addColorStop(1, 'rgba(52, 211, 153, 0)');
        ctx.fillStyle = glow;
        ctx.fill();
      }

      sweepX += speed;
      // Only loop back if data hasn't arrived yet
      if (!dataReadyRef.current && sweepX > width + trailLen) {
        sweepX = 0;
      }

      frameId = requestAnimationFrame(draw);
    }

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
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

export function ZoneCIndicator() {
  const { restingDeploy } = useVitalsStore();
  const { remaining, progress, fetching } = usePollingCountdown();
  const { menuBarHeight, notchWidth } = useGeometryStore();
  const lastPolledAt = useVitalsStore((s) => s.lastPolledAt);
  const state = useVitalsStore((s) => s.state);

  const isResting = state === 'resting';
  const [animationDone, setAnimationDone] = useState(false);
  const showAnimation = !animationDone && isResting;

  const hasDeployData = restingDeploy.sha.length > 0;

  const deployColor =
    restingDeploy.status === 'success'
      ? colors.healthy
      : restingDeploy.status === 'failure'
        ? colors.incident
        : colors.anomaly;

  const hasValidLink = restingDeploy.repo.includes('/') && restingDeploy.fullSha.length > 7;

  const handleCommitClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasValidLink) {
      window.vitals.openExternal(`https://github.com/${restingDeploy.repo}/commit/${restingDeploy.fullSha}`);
    }
  };

  // Show vital signs animation until it completes a full sweep after data arrives
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

  return (
    <>
      {/* Zone A — left: last deploy */}
      {hasDeployData && <div
        style={{
          position: 'absolute',
          top: 0,
          left: 10,
          height: menuBarHeight,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: deployColor,
            flexShrink: 0,
          }}
        />
        <button
          onClick={handleCommitClick}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: hasValidLink ? 'pointer' : 'default',
            fontSize: fontSize.labelSecondary,
            color: colors.textSecondary,
            textDecoration: 'none',
            fontFamily: fonts.mono,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '0.01em',
          }}
        >
          {restingDeploy.sha}
        </button>
        <span
          style={{
            fontSize: fontSize.labelSecondary,
            color: colors.textTertiary,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {restingDeploy.time}
        </span>
      </div>}

      {/* Zone C — right: next polling countdown */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 10,
          height: menuBarHeight,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          zIndex: 10,
        }}
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
    </>
  );
}
