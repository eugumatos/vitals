import { useState, useEffect, useCallback, useRef } from 'react';
import { useVitalsStore } from './store/useVitalsStore';
import { fonts } from './lib/design-tokens';

// ─── Design tokens (settings-specific, inspired by macOS System Settings dark) ───
const s = {
  bg: '#1c1c1e',
  sidebar: '#2c2c2e',
  sidebarHover: '#3a3a3c',
  sidebarActive: '#48484a',
  card: '#2c2c2e',
  cardBorder: 'rgba(255,255,255,0.06)',
  divider: 'rgba(255,255,255,0.06)',
  text: 'rgba(255,255,255,0.92)',
  textSecondary: 'rgba(255,255,255,0.55)',
  textTertiary: 'rgba(255,255,255,0.30)',
  accent: '#34d399',
  danger: '#ef4444',
  warning: '#f5b942',
  blue: '#60a5fa',
} as const;

// ─── Reusable components ───

function ToggleSwitch({ on, onToggle, size = 'normal' }: { on: boolean; onToggle: () => void; size?: 'normal' | 'small' }) {
  const w = size === 'small' ? 34 : 42;
  const h = size === 'small' ? 18 : 24;
  const dot = size === 'small' ? 14 : 18;
  const pad = size === 'small' ? 2 : 3;
  return (
    <button
      onClick={onToggle}
      style={{
        width: w, height: h, borderRadius: h / 2, border: 'none', cursor: 'pointer',
        position: 'relative', padding: 0, flexShrink: 0,
        background: on ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.10)',
        transition: 'background 0.2s',
      }}
    >
      <div style={{
        width: dot, height: dot, borderRadius: '50%',
        background: on ? s.accent : 'rgba(255,255,255,0.4)',
        position: 'absolute', top: pad,
        left: on ? w - dot - pad : pad,
        transition: 'left 0.2s, background 0.2s',
      }} />
    </button>
  );
}

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: s.card,
      border: `0.5px solid ${s.cardBorder}`,
      borderRadius: 12,
      padding: '16px 20px',
      marginBottom: 16,
    }}>
      {title && (
        <div style={{ fontSize: 13, fontWeight: 600, color: s.text, marginBottom: 14, letterSpacing: '0.01em' }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function SettingRow({ label, description, last, children }: {
  label: string; description?: string; last?: boolean; children: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0',
      borderBottom: last ? 'none' : `0.5px solid ${s.divider}`,
      gap: 16,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: s.text }}>{label}</div>
        {description && (
          <div style={{ fontSize: 11, color: s.textTertiary, marginTop: 2, lineHeight: 1.4 }}>{description}</div>
        )}
      </div>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function PillSelect({ options, value, onChange }: {
  options: Array<{ label: string; value: string | number }>;
  value: string | number;
  onChange: (v: any) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 2 }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            background: value === opt.value ? 'rgba(255,255,255,0.12)' : 'transparent',
            border: 'none',
            borderRadius: 6,
            color: value === opt.value ? s.text : s.textTertiary,
            fontSize: 12,
            padding: '4px 10px',
            cursor: 'pointer',
            fontVariantNumeric: 'tabular-nums',
            transition: 'all 0.15s',
            fontFamily: fonts.mono,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function HourStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const label = `${String(value).padStart(2, '0')}:00`;
  const btnStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6,
    color: s.textSecondary, cursor: 'pointer', fontSize: 14,
    width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button onClick={() => onChange((value - 1 + 24) % 24)} style={btnStyle}>-</button>
      <span style={{ fontSize: 13, fontFamily: fonts.mono, color: s.text, minWidth: 42, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{label}</span>
      <button onClick={() => onChange((value + 1) % 24)} style={btnStyle}>+</button>
    </div>
  );
}

// ─── Sidebar items ───

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  section: 'integrations' | 'preferences';
}

const integrationSvgs: Record<string, (size: number) => React.ReactNode> = {
  github: (sz) => <svg width={sz} height={sz} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>,
  vercel: (sz) => <svg width={sz} height={sz} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}><path d="M8 0L16 14H0L8 0Z" /></svg>,
  sentry: (sz) => <svg width={sz} height={sz} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}><path d="M9.14 2.07a1.28 1.28 0 0 0-2.22 0L.26 13.93a1.28 1.28 0 0 0 1.11 1.92h3.06a1.28 1.28 0 0 0 1.11-.64l.53-.92a4.6 4.6 0 0 0-1.88-1.09l-.22.38H2.13L8.03 3.2l2.66 4.62a6.2 6.2 0 0 1 1.6.92L9.14 2.07zm4.66 11.42a2.8 2.8 0 0 0-1.8-2.62 4.8 4.8 0 0 0-1.38-.82 5.4 5.4 0 0 1 1.78 3.44h-1.6a3.8 3.8 0 0 0-3.08-3.58l-.88 1.52a2.2 2.2 0 0 1 2.36 2.06H7.62l.88-1.52h1.3a3.9 3.9 0 0 1 .62-.04h3.38z" /></svg>,
  openai: (sz) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }}><path d="M22.28 9.37a5.99 5.99 0 0 0-.52-4.93 6.07 6.07 0 0 0-6.52-2.91A5.99 5.99 0 0 0 10.69 0a6.07 6.07 0 0 0-5.78 4.18 5.99 5.99 0 0 0-4.01 2.91A6.07 6.07 0 0 0 1.64 13a5.99 5.99 0 0 0 .52 4.93 6.07 6.07 0 0 0 6.52 2.91A5.99 5.99 0 0 0 13.23 22a6.07 6.07 0 0 0 5.78-4.18 5.99 5.99 0 0 0 4.01-2.91 6.07 6.07 0 0 0-.74-5.54zM13.23 20.6a4.49 4.49 0 0 1-2.88-1.05l.14-.08 4.78-2.76a.78.78 0 0 0 .39-.67v-6.74l2.02 1.17a.07.07 0 0 1 .04.06v5.58a4.52 4.52 0 0 1-4.49 4.49zM3.6 16.82a4.49 4.49 0 0 1-.54-3.02l.14.09 4.78 2.76a.78.78 0 0 0 .78 0l5.83-3.37v2.33a.07.07 0 0 1-.03.06l-4.83 2.79a4.52 4.52 0 0 1-6.13-1.64zM2.34 7.89A4.49 4.49 0 0 1 4.69 5.9v5.69a.78.78 0 0 0 .39.67l5.83 3.37-2.02 1.17a.07.07 0 0 1-.07 0L4 13.99a4.52 4.52 0 0 1-1.66-6.1zm17.05 3.97l-5.83-3.37 2.02-1.17a.07.07 0 0 1 .07 0l4.83 2.79a4.52 4.52 0 0 1-.69 8.14v-5.72a.78.78 0 0 0-.4-.67zm2.01-3.03l-.14-.09-4.78-2.76a.78.78 0 0 0-.78 0l-5.83 3.37V7.02a.07.07 0 0 1 .03-.06l4.83-2.79a4.52 4.52 0 0 1 6.67 4.66zM8.68 13.34l-2.02-1.17a.07.07 0 0 1-.04-.06V6.53a4.52 4.52 0 0 1 7.4-3.47l-.14.08-4.78 2.76a.78.78 0 0 0-.39.67l-.03 6.77zm1.1-2.37l2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5v-3z" /></svg>,
  anthropic: (sz) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }}><path d="M13.83 2H16.7l6.3 20h-2.87l-1.46-4.87H13.2L16.03 2zm.86 12.26h3.65L16.5 8.16l-1.81 6.1zM7.3 2H4.12L0 22h2.87l1.04-5.17h5.12L10.07 22H13L7.3 2zm-2.6 12.26L6.71 6.1l2.43 8.16H4.7z" /></svg>,
  datadog: (sz) => <svg width={sz} height={sz} viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}><path d="M10.93 2.08L8.94.42 7.1 1.87l-.47-.36L4.4 3.32l.6.77-.42.56 1.6 1.2-.07.85 1.38 1.02.7-.65 1.42.53.17-.65 1.63-.15.22-1.27 1.1-.87-.18-1.05-1.62-1.52zm-1.2 7.34l-.88-.53-.95.75-1.25-.93.1-1.08-1.3-.97-.64.44-.6-.77-1.04.84.27 4.63 3.52 2.56 4.31-1.67.39-4.42-1.03.45-.9.7z" /></svg>,
  supabase: (sz) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }}><path d="M13.7 21.8c-.5.7-1.6.3-1.6-.6V13h8.2c1 0 1.6 1.2.9 2l-7.5 6.8z" opacity="0.6" /><path d="M10.3 2.2c.5-.7 1.6-.3 1.6.6V11H3.7c-1 0-1.6-1.2-.9-2l7.5-6.8z" /></svg>,
};

function IntegrationIcon({ name, connected }: { name: string; connected: boolean }) {
  const renderSvg = integrationSvgs[name];
  return (
    <div style={{
      width: 22, height: 22, borderRadius: 6,
      background: connected ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)',
      border: `0.5px solid ${connected ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.08)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: connected ? s.accent : s.textTertiary,
    }}>
      {renderSvg ? renderSvg(12) : <span style={{ fontSize: 9, fontWeight: 700, fontFamily: fonts.mono }}>{name[0].toUpperCase()}</span>}
    </div>
  );
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'integrations', label: 'Integrations', section: 'integrations', icon: <span style={{ fontSize: 14 }}>+</span> },
  { id: 'general', label: 'General', section: 'preferences', icon: <span style={{ fontSize: 14 }}>*</span> },
];

const TOKEN_URLS: Record<string, { label: string; url: string; hint: string; placeholder: string }> = {
  github: { label: 'github.com/settings/developers', url: 'https://github.com/settings/developers', hint: 'Create a GitHub OAuth App, then paste the Client ID.', placeholder: 'Ov23li...' },
  vercel: { label: 'vercel.com/account/tokens', url: 'https://vercel.com/account/tokens', hint: 'Create an access token.', placeholder: 'token...' },
  sentry: { label: 'sentry.io/settings/developer-settings', url: 'https://sentry.io/settings/account/api/applications/', hint: 'Create an OAuth Application, then paste Client ID and Client Secret.', placeholder: 'Client ID' },
  openai: { label: 'platform.openai.com/api-keys', url: 'https://platform.openai.com/api-keys', hint: 'Create an admin API key.', placeholder: 'sk-admin-...' },
  anthropic: { label: 'console.anthropic.com/settings/admin-keys', url: 'https://console.anthropic.com/settings/admin-keys', hint: 'Or use an Admin Key for org-wide usage.', placeholder: 'sk-ant-admin-...' },
  datadog: { label: 'app.datadoghq.com/api-keys', url: 'https://app.datadoghq.com/organization-settings/api-keys', hint: 'Get API key + App key.', placeholder: 'api_key:app_key' },
  supabase: { label: 'supabase.com/dashboard/account/tokens', url: 'https://supabase.com/dashboard/account/tokens', hint: 'Create an access token.', placeholder: 'sbp_...' },
};

// ─── Integration explainer: animated preview + setup steps ───

interface IntegrationInfo {
  tagline: string;
  features: string[];
  steps: string[];
}

const INTEGRATION_INFO: Record<string, IntegrationInfo> = {
  github: {
    tagline: 'PRs, Actions & notifications at a glance',
    features: ['Pull requests with review context (yours vs. review requests)', 'CI/CD action results in real-time', 'GitHub notifications — mentions, reviews, assignments'],
    steps: ['Create an OAuth App at github.com/settings/developers', 'Paste the Client ID above', 'Authorize on the browser popup'],
  },
  vercel: {
    tagline: 'Deploy status & build logs live',
    features: ['Real-time deploy progress with build steps', 'Instant success/failure notifications', 'Runtime & build log streaming'],
    steps: ['Go to vercel.com/account/tokens', 'Create a full-access token', 'Paste it above'],
  },
  sentry: {
    tagline: 'Error tracking & issue monitoring',
    features: ['Unresolved issues with severity', 'Error rate trends (24h)', 'New issue alerts in real-time'],
    steps: ['Go to sentry.io → Settings → Developer Settings → OAuth Applications', 'Create an app with redirect URI: http://localhost:18321/callback', 'Paste Client ID and Client Secret above, then authorize'],
  },
  openai: {
    tagline: 'API usage, costs & model breakdown',
    features: ['Total requests & token usage', 'Cost tracking by model', 'Period-over-period comparison'],
    steps: ['Go to platform.openai.com/api-keys', 'Create an admin-level API key', 'Paste it above'],
  },
  anthropic: {
    tagline: 'Claude Code usage, tokens & cost tracking',
    features: ['Session history with token counts', 'Cost per model (Opus, Sonnet, Haiku)', 'Auto-detects Claude Code — no key needed'],
    steps: ['Click "Detect Claude Code" to connect instantly', 'Or use an Admin Key for org-wide usage data', 'Works with Max, Pro, and API plans'],
  },
  datadog: {
    tagline: 'Monitor alerts & infrastructure health',
    features: ['Active monitor status (OK/Alert/Warn)', 'Alert count at a glance', 'Multi-monitor overview'],
    steps: ['Go to Datadog Organization Settings', 'Get your API key + App key', 'Paste as api_key:app_key above'],
  },
  supabase: {
    tagline: 'Database health, projects & connections',
    features: ['Project status at a glance (healthy / unhealthy)', 'Database size & active connections', 'Multi-project monitoring across regions'],
    steps: ['Go to supabase.com/dashboard/account/tokens', 'Generate an access token', 'Paste it above'],
  },
};

// Shared animation styles for explainer previews
const ani = (delay: number) => ({ animation: `explainer-row-in 0.4s ease ${delay}s both` } as const);
const monoSm = { fontSize: 11, fontFamily: fonts.mono } as const;
const monoXs = { fontSize: 10, fontFamily: fonts.mono } as const;

// ── Shared mock components ──

// Mock row for the hover/expanded view
function MockRow({ dot, label, value, tag, dotColor, valueColor, delay }: {
  dot?: string; label: string; value?: string; tag?: string;
  dotColor?: string; valueColor?: string; delay: number;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5, padding: '3px 0',
      borderBottom: '0.5px solid rgba(255,255,255,0.04)', ...ani(delay),
    }}>
      {dot !== undefined && <div style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor || s.accent, flexShrink: 0 }} />}
      <span style={{ ...monoXs, color: s.textSecondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {tag && <span style={{ ...monoXs, color: s.textTertiary, background: 'rgba(255,255,255,0.04)', padding: '0 4px', borderRadius: 3, fontSize: 9, flexShrink: 0 }}>{tag}</span>}
      {value && <span style={{ ...monoXs, color: valueColor || s.textSecondary, flexShrink: 0, fontWeight: 600 }}>{value}</span>}
    </div>
  );
}

// Section label
function MockSection({ label, delay }: { label: string; delay: number }) {
  return <div style={{ ...monoXs, color: s.textTertiary, fontSize: 9, marginBottom: 2, marginTop: 4, ...ani(delay) }}>{label}</div>;
}

// Summary stat at the bottom
function MockStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ ...monoXs, color: s.textTertiary, fontSize: 8 }}>{label}</div>
      <div style={{ ...monoSm, color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

// ── Per-integration hover mock: what the user sees when the notch is open ──

function GitHubPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '2px 6px' }}>
      <MockSection label="pull requests" delay={0.05} />
      <MockRow dot="" dotColor={s.accent} label="fix: auth middleware" tag="main" value="approved" valueColor={s.accent} delay={0.1} />
      <MockRow dot="" dotColor={s.warning} label="feat: dashboard redesign" tag="dev" value="review" valueColor={s.warning} delay={0.15} />
      <MockSection label="actions" delay={0.2} />
      <MockRow dot="" dotColor={s.accent} label="CI / deploy" tag="abc1234" value="passing" valueColor={s.accent} delay={0.25} />
      <MockRow dot="" dotColor={s.danger} label="CI / test" tag="def5678" value="failed" valueColor={s.danger} delay={0.3} />
      <div style={{ display: 'flex', gap: 12, marginTop: 6, paddingTop: 4, borderTop: '0.5px solid rgba(255,255,255,0.04)', ...ani(0.35) }}>
        <MockStat label="PRs" value="2 · 1 review" color={s.warning} />
        <MockStat label="CI" value="1 failed" color={s.danger} />
        <MockStat label="Inbox" value="3 new" color={s.blue || s.text} />
      </div>
    </div>
  );
}

function VercelPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '2px 6px' }}>
      <MockSection label="deploys" delay={0.05} />
      <MockRow dot="" dotColor={s.accent} label="my-app" tag="abc1234" value="ready" valueColor={s.accent} delay={0.1} />
      <MockRow dot="" dotColor={s.warning} label="api-service" tag="def5678" value="building" valueColor={s.warning} delay={0.15} />
      <MockRow dot="" dotColor={s.accent} label="docs" tag="ghi9012" value="ready" valueColor={s.accent} delay={0.2} />
      <MockRow dot="" dotColor={s.danger} label="admin" tag="jkl3456" value="error" valueColor={s.danger} delay={0.25} />
      <div style={{ display: 'flex', gap: 12, marginTop: 6, paddingTop: 4, borderTop: '0.5px solid rgba(255,255,255,0.04)', ...ani(0.3) }}>
        <MockStat label="ready" value="2" color={s.accent} />
        <MockStat label="errors" value="1" color={s.danger} />
        <MockStat label="building" value="1" color={s.warning} />
      </div>
    </div>
  );
}

function SentryPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '2px 6px' }}>
      <MockSection label="unresolved issues" delay={0.05} />
      <MockRow dot="" dotColor={s.danger} label="TypeError: null is not an object" value="124" valueColor={s.danger} delay={0.1} />
      <MockRow dot="" dotColor={s.warning} label="NetworkError: request timeout" value="18" valueColor={s.warning} delay={0.15} />
      <MockRow dot="" dotColor={s.textTertiary} label="Warning: Each child should have key" value="6" valueColor={s.textTertiary} delay={0.2} />
      <div style={{ display: 'flex', gap: 12, marginTop: 6, paddingTop: 4, borderTop: '0.5px solid rgba(255,255,255,0.04)', ...ani(0.25) }}>
        <MockStat label="errors/24h" value="142" color={s.danger} />
        <MockStat label="unresolved" value="38" color={s.warning} />
        <MockStat label="new today" value="3" color={s.text} />
      </div>
    </div>
  );
}

function OpenAIPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '2px 6px' }}>
      <MockSection label="usage by model" delay={0.05} />
      <MockRow label="gpt-4o" value="1.2k calls · $8.40" valueColor={s.textSecondary} delay={0.1} />
      <MockRow label="gpt-4o-mini" value="8.4k calls · $3.20" valueColor={s.textSecondary} delay={0.15} />
      <MockRow label="gpt-3.5-turbo" value="420 calls · $0.80" valueColor={s.textSecondary} delay={0.2} />
      <div style={{ display: 'flex', gap: 12, marginTop: 6, paddingTop: 4, borderTop: '0.5px solid rgba(255,255,255,0.04)', ...ani(0.25) }}>
        <MockStat label="total calls" value="10k" color={s.text} />
        <MockStat label="tokens" value="24M" color={s.textSecondary} />
        <MockStat label="cost" value="$12.40" color={s.warning} />
      </div>
    </div>
  );
}

function AnthropicPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '2px 6px' }}>
      <MockSection label="usage by model" delay={0.05} />
      <MockRow label="claude-opus-4" value="120 calls · $4.80" valueColor={s.textSecondary} delay={0.1} />
      <MockRow label="claude-sonnet-4" value="920 calls · $3.10" valueColor={s.textSecondary} delay={0.15} />
      <MockRow label="claude-haiku-3.5" value="3.1k calls · $0.80" valueColor={s.textSecondary} delay={0.2} />
      <div style={{ display: 'flex', gap: 12, marginTop: 6, paddingTop: 4, borderTop: '0.5px solid rgba(255,255,255,0.04)', ...ani(0.25) }}>
        <MockStat label="total calls" value="4.1k" color={s.text} />
        <MockStat label="tokens" value="18M" color={s.textSecondary} />
        <MockStat label="cost" value="$8.70" color={s.textSecondary} />
      </div>
    </div>
  );
}

function DatadogPreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '2px 6px' }}>
      <MockSection label="monitors" delay={0.05} />
      <MockRow dot="" dotColor={s.accent} label="API latency p99" value="OK" valueColor={s.accent} delay={0.1} />
      <MockRow dot="" dotColor={s.danger} label="Error rate > 5%" value="Alert" valueColor={s.danger} delay={0.15} />
      <MockRow dot="" dotColor={s.warning} label="CPU usage" value="Warn" valueColor={s.warning} delay={0.2} />
      <MockRow dot="" dotColor={s.accent} label="Memory usage" value="OK" valueColor={s.accent} delay={0.25} />
      <div style={{ display: 'flex', gap: 12, marginTop: 6, paddingTop: 4, borderTop: '0.5px solid rgba(255,255,255,0.04)', ...ani(0.3) }}>
        <MockStat label="OK" value="4" color={s.accent} />
        <MockStat label="Alert" value="1" color={s.danger} />
        <MockStat label="Warn" value="1" color={s.warning} />
      </div>
    </div>
  );
}

function SupabasePreview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '2px 6px' }}>
      <MockSection label="projects" delay={0.05} />
      <MockRow dot="" dotColor={s.accent} label="prod-app" tag="us-east-1" value="healthy" valueColor={s.accent} delay={0.1} />
      <MockRow dot="" dotColor={s.accent} label="staging" tag="eu-west-1" value="healthy" valueColor={s.accent} delay={0.15} />
      <MockRow dot="" dotColor={s.danger} label="analytics" tag="us-east-1" value="unhealthy" valueColor={s.danger} delay={0.2} />
      <div style={{ display: 'flex', gap: 12, marginTop: 6, paddingTop: 4, borderTop: '0.5px solid rgba(255,255,255,0.04)', ...ani(0.25) }}>
        <MockStat label="healthy" value="2" color={s.accent} />
        <MockStat label="unhealthy" value="1" color={s.danger} />
        <MockStat label="projects" value="3" color={s.text} />
      </div>
    </div>
  );
}

const PREVIEW_CONTENT: Record<string, React.ReactNode> = {
  github: <GitHubPreview />,
  vercel: <VercelPreview />,
  sentry: <SentryPreview />,
  openai: <OpenAIPreview />,
  anthropic: <AnthropicPreview />,
  datadog: <DatadogPreview />,
  supabase: <SupabasePreview />,
};

function IntegrationExplainer({ id }: { id: string }) {
  const info = INTEGRATION_INFO[id];
  if (!info) return null;
  const preview = PREVIEW_CONTENT[id];
  const renderSvg = integrationSvgs[id];

  return (
    <div style={{ marginBottom: 16 }}>
      <style>{`
        @keyframes explainer-row-in {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes explainer-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes explainer-scan {
          0%   { left: 0%; opacity: 0; }
          10%  { opacity: 0.5; }
          90%  { opacity: 0.5; }
          100% { left: 100%; opacity: 0; }
        }
        @keyframes explainer-bar-fill {
          from { width: 0%; }
        }
      `}</style>

      {/* Tagline */}
      <div style={{
        fontSize: 13, color: s.textSecondary, marginBottom: 14, lineHeight: 1.5,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {renderSvg && <span style={{ color: s.textTertiary, flexShrink: 0 }}>{renderSvg(14)}</span>}
        {info.tagline}
      </div>

      {/* Animated preview card */}
      <div style={{
        background: '#1a1a1c', borderRadius: 10,
        border: '0.5px solid rgba(255,255,255,0.06)',
        padding: '10px 8px', marginBottom: 14,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Scan line effect */}
        <div style={{
          position: 'absolute', top: 0, width: '30%', height: '100%',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.02), transparent)',
          animation: 'explainer-scan 3s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
        {/* Live indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          marginBottom: 8, paddingLeft: 10,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: s.accent, animation: 'explainer-pulse 1.5s ease-in-out infinite' }} />
          <span style={{ fontSize: 9, color: s.textTertiary, fontFamily: fonts.mono, letterSpacing: '0.05em', textTransform: 'uppercase' }}>preview</span>
        </div>
        {preview}
      </div>

      {/* Feature bullets */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {info.features.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ color: s.accent, fontSize: 11, marginTop: 1, flexShrink: 0 }}>✓</span>
            <span style={{ fontSize: 12, color: s.textSecondary, lineHeight: 1.4 }}>{f}</span>
          </div>
        ))}
      </div>

      {/* Setup steps */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', borderRadius: 8,
        padding: '10px 12px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <span style={{ fontSize: 10, color: s.textTertiary, fontFamily: fonts.mono, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2 }}>setup</span>
        {info.steps.map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{
              width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(255,255,255,0.06)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700, color: s.textTertiary, fontFamily: fonts.mono,
            }}>
              {i + 1}
            </span>
            <span style={{ fontSize: 12, color: s.textSecondary, lineHeight: 1.4, paddingTop: 1 }}>{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const POLLING_OPTIONS = [
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '2m', value: 120 },
  { label: '5m', value: 300 },
];

const RESTING_MODES = [
  { value: 'pulse', label: 'Pulse', description: 'Ambient EKG heartbeat that cycles through integration colors' },
  { value: 'glance', label: 'Glance', description: 'Rotates health and activity data from each integration' },
];

// ─── Integration detail panel ───

function IntegrationDetail({ id, connected, onConnect, onDisconnect }: {
  id: string; connected: boolean;
  onConnect: (id: string, token: string) => Promise<boolean>;
  onDisconnect: (id: string) => Promise<void>;
}) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const info = TOKEN_URLS[id];

  // Sentry OAuth state
  const [sentryClientId, setSentryClientId] = useState('');
  const [sentryClientSecret, setSentryClientSecret] = useState('');
  const [sentryOAuthLoading, setSentryOAuthLoading] = useState(false);

  // Anthropic local mode state
  const [anthropicMode, setAnthropicMode] = useState<'choose' | 'admin'>('choose');
  const [anthropicLocalLoading, setAnthropicLocalLoading] = useState(false);
  const [anthropicPlan, setAnthropicPlan] = useState<string>('max');

  // GitHub device flow state
  const { deviceFlow, setDeviceFlow, resetDeviceFlow, setConnectorConnected } = useVitalsStore();

  useEffect(() => {
    if (id === 'github') {
      window.vitals.github.onDeviceFlowSuccess(() => {
        setConnectorConnected('github', true);
        resetDeviceFlow();
        setJustConnected(true);
        setTimeout(() => setJustConnected(false), 2000);
      });
    }
    if (id === 'sentry') {
      window.vitals.sentry.onOAuthSuccess(() => {
        setConnectorConnected('sentry', true);
        setSentryOAuthLoading(false);
        setSentryClientId('');
        setSentryClientSecret('');
        setJustConnected(true);
        setTimeout(() => setJustConnected(false), 2000);
      });
    }
  }, [id, setConnectorConnected, resetDeviceFlow]);

  const handleSubmit = async () => {
    if (!token.trim()) return;
    setLoading(true);
    setError(null);
    const success = await onConnect(id, token.trim());
    setLoading(false);
    if (success) {
      setToken('');
      setJustConnected(true);
      setTimeout(() => setJustConnected(false), 2000);
    } else {
      setError('Failed to connect. Check your token.');
    }
  };

  const handleSentryOAuth = async () => {
    if (!sentryClientId.trim() || !sentryClientSecret.trim()) return;
    setSentryOAuthLoading(true);
    setError(null);
    const result = await window.vitals.sentry.startOAuth(sentryClientId.trim(), sentryClientSecret.trim());
    if (result.success) {
      setConnectorConnected('sentry', true);
      setSentryOAuthLoading(false);
      setSentryClientId('');
      setSentryClientSecret('');
      setJustConnected(true);
      setTimeout(() => setJustConnected(false), 2000);
    } else {
      setError(result.error || 'OAuth flow failed');
      setSentryOAuthLoading(false);
    }
  };

  const handleGitHubStartFlow = async () => {
    if (!deviceFlow.clientId.trim()) return;
    setDeviceFlow({ error: null });
    const result = await window.vitals.github.startDeviceFlow(deviceFlow.clientId.trim());
    if (result.success && result.data) {
      setDeviceFlow({ step: 'waiting', userCode: result.data.userCode });
    } else {
      setDeviceFlow({ error: result.error || 'Failed to start flow' });
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <IntegrationIcon name={id} connected={connected} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: s.text, textTransform: 'capitalize' }}>{id}</div>
          <div style={{ fontSize: 12, color: connected ? s.accent : s.textTertiary, marginTop: 2 }}>
            {justConnected ? 'Connected!' : connected ? 'Connected' : 'Not connected'}
          </div>
        </div>
        {connected && (
          <button
            onClick={() => onDisconnect(id)}
            style={{
              marginLeft: 'auto',
              background: 'rgba(239,68,68,0.1)',
              border: '0.5px solid rgba(239,68,68,0.2)',
              borderRadius: 8, color: s.danger,
              fontSize: 12, padding: '6px 14px', cursor: 'pointer',
            }}
          >
            Disconnect
          </button>
        )}
      </div>

      {!connected && (
        <SectionCard title="Connect">
          {id === 'github' ? (
            // GitHub device flow
            <>
              {deviceFlow.step === 'idle' && (
                <>
                  <div style={{ fontSize: 12, color: s.textSecondary, marginBottom: 10, lineHeight: 1.5 }}>
                    {info.hint}{' '}
                    <span
                      onClick={() => window.vitals.openExternal(info.url)}
                      style={{ color: s.blue, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      {info.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={deviceFlow.clientId}
                      onChange={(e) => setDeviceFlow({ clientId: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && handleGitHubStartFlow()}
                      placeholder={info.placeholder}
                      style={inputStyle}
                      autoFocus
                    />
                    <button onClick={handleGitHubStartFlow} style={connectBtnStyle}>Connect</button>
                  </div>
                </>
              )}
              {deviceFlow.step === 'client_id' && (
                <>
                  <div style={{ fontSize: 12, color: s.textSecondary, marginBottom: 10, lineHeight: 1.5 }}>
                    {info.hint}{' '}
                    <span
                      onClick={() => window.vitals.openExternal(info.url)}
                      style={{ color: s.blue, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      {info.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={deviceFlow.clientId}
                      onChange={(e) => setDeviceFlow({ clientId: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && handleGitHubStartFlow()}
                      placeholder={info.placeholder}
                      style={inputStyle}
                      autoFocus
                    />
                    <button onClick={handleGitHubStartFlow} style={connectBtnStyle}>Connect</button>
                    <button onClick={() => resetDeviceFlow()} style={ghostBtnStyle}>Cancel</button>
                  </div>
                </>
              )}
              {deviceFlow.step === 'waiting' && (
                <div>
                  <div style={{ fontSize: 12, color: s.textSecondary, marginBottom: 12 }}>
                    1. Copy the code below, then authorize on{' '}
                    <span
                      onClick={() => window.vitals.openExternal('https://github.com/login/device')}
                      style={{ color: s.blue, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      github.com/login/device
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                      fontSize: 22, fontWeight: 700, fontFamily: fonts.mono, color: s.text,
                      letterSpacing: '0.15em', background: 'rgba(255,255,255,0.06)',
                      padding: '8px 18px', borderRadius: 8, userSelect: 'text',
                    }}>
                      {deviceFlow.userCode}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(deviceFlow.userCode);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      style={{
                        ...ghostBtnStyle,
                        color: copied ? s.accent : undefined,
                        borderColor: copied ? 'rgba(52,211,153,0.3)' : undefined,
                      }}
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: s.textSecondary, marginTop: 14, marginBottom: 10 }}>
                    2. After authorizing on GitHub, confirm below.
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      onClick={async () => {
                        setVerifying(true);
                        setDeviceFlow({ error: null });
                        // Give the backend a moment to detect the authorization
                        const check = await window.vitals.github.isConfigured();
                        if (check) {
                          setConnectorConnected('github', true);
                          resetDeviceFlow();
                          setJustConnected(true);
                          setVerifying(false);
                          setTimeout(() => setJustConnected(false), 2000);
                        } else {
                          setDeviceFlow({ error: 'Authorization not detected yet. Make sure you completed the flow on GitHub, then try again.' });
                          setVerifying(false);
                        }
                      }}
                      disabled={verifying}
                      style={{
                        ...connectBtnStyle,
                        opacity: verifying ? 0.6 : 1,
                        cursor: verifying ? 'wait' : 'pointer',
                      }}
                    >
                      {verifying ? 'Verifying...' : "I've authorized"}
                    </button>
                    <button onClick={() => { window.vitals.github.cancelDeviceFlow(); resetDeviceFlow(); }} style={ghostBtnStyle}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {deviceFlow.error && (
                <div style={{ fontSize: 12, color: s.danger, marginTop: 8 }}>{deviceFlow.error}</div>
              )}
            </>
          ) : id === 'sentry' ? (
            // Sentry OAuth flow
            <>
              <div style={{ fontSize: 12, color: s.textSecondary, marginBottom: 10, lineHeight: 1.5 }}>
                {info?.hint}{' '}
                {info?.url && (
                  <span
                    onClick={() => window.vitals.openExternal(info.url)}
                    style={{ color: s.blue, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {info.label}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  value={sentryClientId}
                  onChange={(e) => setSentryClientId(e.target.value)}
                  placeholder="Client ID"
                  style={inputStyle}
                  autoFocus
                />
                <input
                  value={sentryClientSecret}
                  onChange={(e) => setSentryClientSecret(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSentryOAuth()}
                  placeholder="Client Secret"
                  type="password"
                  style={inputStyle}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleSentryOAuth}
                    disabled={sentryOAuthLoading || !sentryClientId.trim() || !sentryClientSecret.trim()}
                    style={{ ...connectBtnStyle, opacity: (sentryOAuthLoading || !sentryClientId.trim() || !sentryClientSecret.trim()) ? 0.6 : 1 }}
                  >
                    {sentryOAuthLoading ? 'Waiting for authorization...' : 'Connect with Sentry'}
                  </button>
                  {sentryOAuthLoading && (
                    <button onClick={() => { window.vitals.sentry.cancelOAuth(); setSentryOAuthLoading(false); }} style={ghostBtnStyle}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
              {error && <div style={{ fontSize: 12, color: s.danger, marginTop: 8 }}>{error}</div>}
            </>
          ) : id === 'anthropic' ? (
            // Anthropic: local detect or admin key
            <>
              {anthropicMode === 'choose' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 12, color: s.textSecondary, lineHeight: 1.5 }}>
                    Reads your local Claude Code usage data — no key required.
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: s.textTertiary }}>Plan</span>
                    {(['max', 'pro', 'api'] as const).map((plan) => (
                      <button
                        key={plan}
                        onClick={() => setAnthropicPlan(plan)}
                        style={{
                          fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                          textTransform: 'uppercase', letterSpacing: '0.05em',
                          border: `1px solid ${anthropicPlan === plan ? (plan === 'max' ? '#a78bfa' : plan === 'pro' ? '#60a5fa' : s.accent) : 'rgba(255,255,255,0.08)'}`,
                          background: anthropicPlan === plan ? `${plan === 'max' ? '#a78bfa' : plan === 'pro' ? '#60a5fa' : s.accent}18` : 'transparent',
                          color: anthropicPlan === plan ? (plan === 'max' ? '#a78bfa' : plan === 'pro' ? '#60a5fa' : s.accent) : s.textTertiary,
                        }}
                      >
                        {plan}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={async () => {
                      setAnthropicLocalLoading(true);
                      setError(null);
                      const result = await window.vitals.anthropic.enableLocal(anthropicPlan);
                      if (result.success) {
                        setConnectorConnected('anthropic', true);
                        setJustConnected(true);
                        setTimeout(() => setJustConnected(false), 2000);
                      } else {
                        setError('Claude Code not found. Install it or use an Admin Key instead.');
                      }
                      setAnthropicLocalLoading(false);
                    }}
                    disabled={anthropicLocalLoading}
                    style={{ ...connectBtnStyle, opacity: anthropicLocalLoading ? 0.6 : 1 }}
                  >
                    {anthropicLocalLoading ? 'Detecting...' : 'Detect Claude Code'}
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 1, background: s.divider }} />
                    <span style={{ fontSize: 11, color: s.textTertiary }}>or</span>
                    <div style={{ flex: 1, height: 1, background: s.divider }} />
                  </div>
                  <button
                    onClick={() => setAnthropicMode('admin')}
                    style={ghostBtnStyle}
                  >
                    Use Admin Key (org-wide)
                  </button>
                  {error && <div style={{ fontSize: 12, color: s.danger, marginTop: 4 }}>{error}</div>}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, color: s.textSecondary, lineHeight: 1.5 }}>
                    {info?.hint}{' '}
                    {info?.url && (
                      <span
                        onClick={() => window.vitals.openExternal(info.url)}
                        style={{ color: s.blue, cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {info.label}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                      placeholder={info?.placeholder || 'sk-ant-admin-...'}
                      type="password"
                      style={inputStyle}
                      autoFocus
                    />
                    <button onClick={handleSubmit} disabled={loading} style={{ ...connectBtnStyle, opacity: loading ? 0.6 : 1 }}>
                      {loading ? 'Connecting...' : 'Connect'}
                    </button>
                  </div>
                  <button onClick={() => setAnthropicMode('choose')} style={{ ...ghostBtnStyle, alignSelf: 'flex-start' }}>
                    Back
                  </button>
                  {error && <div style={{ fontSize: 12, color: s.danger, marginTop: 4 }}>{error}</div>}
                </div>
              )}
            </>
          ) : (
            // Token-based auth
            <>
              <div style={{ fontSize: 12, color: s.textSecondary, marginBottom: 10, lineHeight: 1.5 }}>
                {info?.hint}{' '}
                {info?.url && (
                  <span
                    onClick={() => window.vitals.openExternal(info.url)}
                    style={{ color: s.blue, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {info.label}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder={info?.placeholder || 'token...'}
                  type="password"
                  style={inputStyle}
                  autoFocus
                />
                <button onClick={handleSubmit} disabled={loading} style={{ ...connectBtnStyle, opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Connecting...' : 'Connect'}
                </button>
              </div>
              {error && <div style={{ fontSize: 12, color: s.danger, marginTop: 8 }}>{error}</div>}
            </>
          )}
        </SectionCard>
      )}

      {!connected && <IntegrationExplainer id={id} />}

      {/* Watched repos/projects (per-integration config) */}
      {connected && id === 'github' && <GitHubWatchedRepos />}
      {connected && id === 'vercel' && <VercelWatchedProjects />}
      {connected && id === 'sentry' && <SentryWatchedProjects />}

      {connected && <IntegrationTips id={id} />}
    </div>
  );
}

// ─── Integration tips (shown when connected) ───

const INTEGRATION_TIPS: Record<string, Array<{ icon: string; text: string }>> = {
  github: [
    { icon: '◉', text: 'Hover the notch to see your PRs, CI runs and notifications' },
    { icon: '◎', text: 'Click any PR or action to open it directly on GitHub' },
    { icon: '◈', text: 'Add watched repos below to filter only what matters to you' },
    { icon: '◆', text: 'The notch pulses red when a CI run fails on your branches' },
  ],
  vercel: [
    { icon: '◉', text: 'Deploys appear in real-time — see build progress as it happens' },
    { icon: '◎', text: 'Click a deploy to open the Vercel inspector with logs' },
    { icon: '◈', text: 'Watch specific projects below to reduce noise' },
    { icon: '◆', text: 'Failed deploys trigger a red flash on the notch' },
  ],
  sentry: [
    { icon: '◉', text: 'Unresolved issues are sorted by last seen — freshest first' },
    { icon: '◎', text: 'Click any issue to jump to it on Sentry' },
    { icon: '◈', text: 'Watch specific projects below to focus on what you own' },
    { icon: '◆', text: 'The notch alerts you when 5+ new issues appear in 24h' },
  ],
  openai: [
    { icon: '◉', text: 'Overview shows your estimated cost and request volume (24h)' },
    { icon: '◎', text: 'Click the cost to open the OpenAI usage dashboard' },
    { icon: '◈', text: 'Models tab breaks down token usage and cost per model' },
    { icon: '◆', text: 'You get notified when spend exceeds $10 or $50 in a day' },
  ],
  anthropic: [
    { icon: '◉', text: 'See token usage and sessions across all your Claude Code projects' },
    { icon: '◎', text: 'Sessions tab shows per-project breakdown with message counts' },
    { icon: '◈', text: 'Data refreshes automatically — covers the last 7 days' },
    { icon: '◆', text: 'Switch between Max, Pro or API plan in the connect screen' },
  ],
  datadog: [
    { icon: '◉', text: 'Active monitors are shown with their current status at a glance' },
    { icon: '◎', text: 'Click a monitor to open it in Datadog' },
    { icon: '◈', text: 'Monitors in Alert or Warn state appear first' },
    { icon: '◆', text: 'The notch reacts when monitors change to alert state' },
  ],
  supabase: [
    { icon: '◉', text: 'Each project shows health status, disk usage and connections' },
    { icon: '◎', text: 'Click a project card to open it in the Supabase dashboard' },
    { icon: '◈', text: 'Performance and security lints highlight issues to fix' },
    { icon: '◆', text: 'You get alerted when disk usage exceeds 85% or a project is unhealthy' },
  ],
};

function IntegrationTips({ id }: { id: string }) {
  const tips = INTEGRATION_TIPS[id];
  if (!tips) return null;

  return (
    <SectionCard title="How to use">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tips.map((tip, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ color: s.accent, fontSize: 10, marginTop: 2, flexShrink: 0 }}>{tip.icon}</span>
            <span style={{ fontSize: 12, color: s.textSecondary, lineHeight: 1.5 }}>{tip.text}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ─── Watched repos (GitHub) ───

interface WatchedRepo { fullName: string; branches: string[]; }

const MAX_WATCHED_REPOS = 5;

function GitHubWatchedRepos() {
  const [repos, setRepos] = useState<WatchedRepo[]>([]);
  const [available, setAvailable] = useState<Array<{ fullName: string; defaultBranch: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const atLimit = repos.length >= MAX_WATCHED_REPOS;

  useEffect(() => {
    window.vitals.github.getWatchedRepos().then(setRepos);
  }, []);

  const loadRepos = async () => {
    setLoading(true);
    const result = await window.vitals.github.listRepos();
    if (result.success && result.data) setAvailable(result.data);
    setLoading(false);
    setAdding(true);
  };

  const addRepo = async (repo: { fullName: string; defaultBranch: string }) => {
    if (atLimit) return;
    const updated = [...repos, { fullName: repo.fullName, branches: [repo.defaultBranch] }];
    setRepos(updated);
    await window.vitals.github.setWatchedRepos(updated);
    setAdding(false);
    window.vitals.forceRefresh();
  };

  const removeRepo = async (fullName: string) => {
    const updated = repos.filter((r) => r.fullName !== fullName);
    setRepos(updated);
    await window.vitals.github.setWatchedRepos(updated);
    window.vitals.forceRefresh();
  };

  return (
    <SectionCard title="Watched Repositories">
      {repos.length === 0 && !adding && (
        <div style={{ fontSize: 12, color: s.textTertiary, marginBottom: 8 }}>No repos configured — watching all.</div>
      )}
      {repos.length > 0 && (
        <div style={{ fontSize: 11, color: s.textTertiary, marginBottom: 6 }}>
          {repos.length}/{MAX_WATCHED_REPOS} repos
        </div>
      )}
      {repos.map((repo) => (
        <div key={repo.fullName} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 0', borderBottom: `0.5px solid ${s.divider}`,
        }}>
          <div>
            <span style={{ fontSize: 13, fontFamily: fonts.mono, color: s.text }}>{repo.fullName}</span>
            <span style={{ fontSize: 11, color: s.textTertiary, marginLeft: 8 }}>{repo.branches.length} branches</span>
          </div>
          <button onClick={() => removeRepo(repo.fullName)} style={ghostBtnStyle}>Remove</button>
        </div>
      ))}
      {!adding ? (
        <button
          onClick={loadRepos}
          disabled={loading || atLimit}
          style={{ ...ghostBtnStyle, marginTop: 8, opacity: loading || atLimit ? 0.5 : 1 }}
          title={atLimit ? `Maximum ${MAX_WATCHED_REPOS} repositories` : undefined}
        >
          {loading ? 'Loading...' : atLimit ? `Limit reached (${MAX_WATCHED_REPOS})` : '+ Add Repository'}
        </button>
      ) : (
        <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 8 }}>
          {available.filter((r) => !repos.some((w) => w.fullName === r.fullName)).map((repo) => (
            <div key={repo.fullName} onClick={() => addRepo(repo)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 0', cursor: atLimit ? 'default' : 'pointer',
                borderBottom: `0.5px solid ${s.divider}`,
                opacity: atLimit ? 0.4 : 1,
              }}>
              <span style={{ fontSize: 13, fontFamily: fonts.mono, color: s.text }}>{repo.fullName}</span>
              <span style={{ fontSize: 11, color: s.textTertiary }}>{repo.defaultBranch}</span>
            </div>
          ))}
          <button onClick={() => setAdding(false)} style={{ ...ghostBtnStyle, marginTop: 8 }}>Done</button>
        </div>
      )}
    </SectionCard>
  );
}

// ─── Watched projects (Vercel) ───

function VercelWatchedProjects() {
  const [projects, setProjects] = useState<string[]>([]);
  const [available, setAvailable] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    window.vitals.vercel?.getWatchedProjects().then(setProjects);
  }, []);

  const load = async () => {
    setLoading(true);
    const result = await window.vitals.vercel?.listProjects();
    if (result?.success && result.data) setAvailable(result.data);
    setLoading(false);
    setAdding(true);
  };

  const add = async (name: string) => {
    const updated = [...projects, name];
    setProjects(updated);
    await window.vitals.vercel?.setWatchedProjects(updated);
    setAdding(false);
    window.vitals.forceRefresh();
  };

  const remove = async (name: string) => {
    const updated = projects.filter((p) => p !== name);
    setProjects(updated);
    await window.vitals.vercel?.setWatchedProjects(updated);
    window.vitals.forceRefresh();
  };

  return (
    <SectionCard title="Watched Projects">
      {projects.length === 0 && !adding && (
        <div style={{ fontSize: 12, color: s.textTertiary, marginBottom: 8 }}>No projects configured — watching all.</div>
      )}
      {projects.map((p) => (
        <div key={p} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `0.5px solid ${s.divider}` }}>
          <span style={{ fontSize: 13, fontFamily: fonts.mono, color: s.text }}>{p}</span>
          <button onClick={() => remove(p)} style={ghostBtnStyle}>Remove</button>
        </div>
      ))}
      {!adding ? (
        <button onClick={load} disabled={loading} style={{ ...ghostBtnStyle, marginTop: 8, opacity: loading ? 0.5 : 1 }}>
          {loading ? 'Loading...' : '+ Add Project'}
        </button>
      ) : (
        <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 8 }}>
          {available.filter((p) => !projects.includes(p.name)).map((p) => (
            <div key={p.id} onClick={() => add(p.name)}
              style={{ padding: '8px 0', cursor: 'pointer', borderBottom: `0.5px solid ${s.divider}` }}>
              <span style={{ fontSize: 13, fontFamily: fonts.mono, color: s.text }}>{p.name}</span>
            </div>
          ))}
          <button onClick={() => setAdding(false)} style={{ ...ghostBtnStyle, marginTop: 8 }}>Done</button>
        </div>
      )}
    </SectionCard>
  );
}

// ─── Watched projects (Sentry) ───

function SentryWatchedProjects() {
  const [projects, setProjects] = useState<string[]>([]);
  const [available, setAvailable] = useState<Array<{ slug: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    window.vitals.sentry?.getWatchedProjects().then(setProjects);
  }, []);

  const load = async () => {
    setLoading(true);
    const result = await window.vitals.sentry?.listProjects();
    if (result?.success && result.data) setAvailable(result.data);
    setLoading(false);
    setAdding(true);
  };

  const add = async (slug: string) => {
    const updated = [...projects, slug];
    setProjects(updated);
    await window.vitals.sentry?.setWatchedProjects(updated);
    setAdding(false);
    window.vitals.forceRefresh();
  };

  const remove = async (slug: string) => {
    const updated = projects.filter((p) => p !== slug);
    setProjects(updated);
    await window.vitals.sentry?.setWatchedProjects(updated);
    window.vitals.forceRefresh();
  };

  return (
    <SectionCard title="Watched Projects">
      {projects.length === 0 && !adding && (
        <div style={{ fontSize: 12, color: s.textTertiary, marginBottom: 8 }}>Monitoring all projects.</div>
      )}
      {projects.map((p) => (
        <div key={p} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `0.5px solid ${s.divider}` }}>
          <span style={{ fontSize: 13, fontFamily: fonts.mono, color: s.text }}>{p}</span>
          <button onClick={() => remove(p)} style={ghostBtnStyle}>Remove</button>
        </div>
      ))}
      {!adding ? (
        <button onClick={load} disabled={loading} style={{ ...ghostBtnStyle, marginTop: 8, opacity: loading ? 0.5 : 1 }}>
          {loading ? 'Loading...' : '+ Add Project'}
        </button>
      ) : (
        <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 8 }}>
          {available.filter((p) => !projects.includes(p.slug)).map((p) => (
            <div key={p.slug} onClick={() => add(p.slug)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', cursor: 'pointer', borderBottom: `0.5px solid ${s.divider}` }}>
              <span style={{ fontSize: 13, fontFamily: fonts.mono, color: s.text }}>{p.slug}</span>
              <span style={{ fontSize: 11, color: s.textTertiary }}>{p.name}</span>
            </div>
          ))}
          <button onClick={() => setAdding(false)} style={{ ...ghostBtnStyle, marginTop: 8 }}>Done</button>
        </div>
      )}
    </SectionCard>
  );
}

// ─── General preferences panel ───

function GeneralPreferences() {
  const [pollingInterval, setPollingIntervalLocal] = useState(30);
  const [restingMode, setRestingModeLocal] = useState<string>('pulse');
  const [launchAtLogin, setLaunchAtLoginLocal] = useState(false);
  const [smartSilence, setSmartSilenceLocal] = useState({ enabled: false, startHour: 19, endHour: 8, weekends: true });

  useEffect(() => {
    window.vitals.getPollingInterval().then(setPollingIntervalLocal);
    window.vitals.getRestingMode().then(setRestingModeLocal);
    window.vitals.getLaunchAtLogin().then(setLaunchAtLoginLocal);
    window.vitals.getSmartSilence().then(setSmartSilenceLocal);
  }, []);

  const handlePolling = async (val: number) => {
    setPollingIntervalLocal(val);
    await window.vitals.setPollingInterval(val);
  };

  const handleRestingMode = async (val: string) => {
    setRestingModeLocal(val);
    await window.vitals.setRestingMode(val);
    useVitalsStore.setState({ restingMode: val as any });
  };

  const handleLaunchToggle = async () => {
    const next = !launchAtLogin;
    setLaunchAtLoginLocal(next);
    await window.vitals.setLaunchAtLogin(next);
  };

  const handleSilenceToggle = async () => {
    const next = { ...smartSilence, enabled: !smartSilence.enabled };
    setSmartSilenceLocal(next);
    await window.vitals.setSmartSilence(next);
  };

  const handleSilenceUpdate = async (update: Partial<typeof smartSilence>) => {
    const next = { ...smartSilence, ...update };
    setSmartSilenceLocal(next);
    await window.vitals.setSmartSilence(next);
  };

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 600, color: s.text, marginBottom: 20 }}>General</div>

      <SectionCard title="Polling">
        <SettingRow label="Refresh interval" description="How often Vitals fetches new data from integrations" last>
          <PillSelect
            options={POLLING_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
            value={pollingInterval}
            onChange={handlePolling}
          />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Resting Display">
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {RESTING_MODES.map((mode) => (
            <button
              key={mode.value}
              onClick={() => handleRestingMode(mode.value)}
              style={{
                flex: 1, padding: '12px 8px',
                background: restingMode === mode.value ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                border: restingMode === mode.value ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid transparent',
                borderRadius: 10, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: restingMode === mode.value ? s.text : s.textTertiary }}>{mode.label}</span>
              <span style={{ fontSize: 10, color: s.textTertiary, textAlign: 'center', lineHeight: 1.3 }}>{mode.description}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Behavior">
        <SettingRow label="Launch at login" description="Start Vitals automatically when you log in">
          <ToggleSwitch on={launchAtLogin} onToggle={handleLaunchToggle} />
        </SettingRow>
        <SettingRow label="Smart Silence" description="Mute notifications during off-hours">
          <ToggleSwitch on={smartSilence.enabled} onToggle={handleSilenceToggle} />
        </SettingRow>
        {smartSilence.enabled && (
          <SettingRow label="Quiet hours" last>
            <HourStepper value={smartSilence.startHour} onChange={(v) => handleSilenceUpdate({ startHour: v })} />
            <span style={{ color: s.textTertiary, fontSize: 12 }}>to</span>
            <HourStepper value={smartSilence.endHour} onChange={(v) => handleSilenceUpdate({ endHour: v })} />
            <button
              onClick={() => handleSilenceUpdate({ weekends: !smartSilence.weekends })}
              style={{
                background: smartSilence.weekends ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                border: 'none', borderRadius: 6, fontSize: 11, padding: '4px 8px', cursor: 'pointer',
                color: smartSilence.weekends ? s.text : s.textTertiary, transition: 'all 0.15s',
              }}
            >
              {smartSilence.weekends ? '+ weekends' : 'weekends'}
            </button>
          </SettingRow>
        )}
        <SettingRow label="Keyboard shortcut" last={!smartSilence.enabled}>
          <span style={{ fontSize: 12, fontFamily: fonts.mono, color: s.textSecondary, background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: 4 }}>
            Cmd+Shift+N
          </span>
        </SettingRow>
      </SectionCard>

      <SectionCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: s.text }}>Quit Vitals</span>
          <button
            onClick={() => window.vitals.quit()}
            style={{
              background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.2)',
              borderRadius: 8, color: s.danger, fontSize: 12, padding: '6px 14px', cursor: 'pointer',
            }}
          >
            Quit
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Main SettingsApp ───

export function SettingsApp() {
  const connectors = useVitalsStore((s) => s.connectors);
  const setConnectorConnected = useVitalsStore((s) => s.setConnectorConnected);
  const updateConnectorStatus = useVitalsStore((s) => s.updateConnectorStatus);
  const [activeSection, setActiveSection] = useState('integrations');
  const [activeIntegration, setActiveIntegration] = useState<string | null>(null);

  // Load connector status on mount
  useEffect(() => {
    window.vitals.getConnectorStatus().then(updateConnectorStatus);
  }, [updateConnectorStatus]);

  const handleConnect = useCallback(async (id: string, token: string): Promise<boolean> => {
    let result: { success: boolean; error?: string };
    if (id === 'vercel') result = await window.vitals.vercel.setToken(token);
    else if (id === 'sentry') result = await window.vitals.sentry.setToken(token);
    else if (id === 'openai') result = await window.vitals.openai.setToken(token);
    else if (id === 'anthropic') result = await window.vitals.anthropic.setToken(token);
    else if (id === 'datadog') result = await window.vitals.datadog.setToken(token);
    else if (id === 'supabase') result = await window.vitals.supabase.setToken(token);
    else return false;

    if (result.success) {
      setConnectorConnected(id, true);
      return true;
    }
    return false;
  }, [setConnectorConnected]);

  const handleDisconnect = useCallback(async (id: string) => {
    const api = (window.vitals as any)[id];
    if (api?.disconnect) await api.disconnect();
    setConnectorConnected(id, false);
  }, [setConnectorConnected]);

  const integrationIds = connectors.map((c) => c.id).filter((id) => id !== 'system');

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex',
      background: s.bg, fontFamily: fonts.system,
      borderRadius: 10, overflow: 'hidden',
    }}>
      {/* Titlebar drag area */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 38,
        // @ts-expect-error Electron-specific CSS property for window dragging
        WebkitAppRegion: 'drag', zIndex: 10,
      }} />

      {/* Sidebar */}
      <div style={{
        width: 220, background: s.sidebar, borderRight: `0.5px solid ${s.cardBorder}`,
        paddingTop: 50, display: 'flex', flexDirection: 'column',
        flexShrink: 0,
      }}>
        {/* Section: Integrations header */}
        <div style={{ padding: '0 16px', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: s.textTertiary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Integrations
          </span>
        </div>

        {/* Integration items */}
        {integrationIds.map((id) => {
          const connected = connectors.find((c) => c.id === id)?.connected || false;
          const active = activeSection === 'integrations' && activeIntegration === id;
          return (
            <button
              key={id}
              onClick={() => { setActiveSection('integrations'); setActiveIntegration(id); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 16px', border: 'none', cursor: 'pointer',
                background: active ? s.sidebarActive : 'transparent',
                borderRadius: 0, width: '100%', textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = s.sidebarHover; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <IntegrationIcon name={id} connected={connected} />
              <span style={{ fontSize: 13, color: s.text, textTransform: 'capitalize', flex: 1 }}>{id}</span>
              {connected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.accent }} />}
            </button>
          );
        })}

        {/* Divider */}
        <div style={{ height: 0.5, background: s.divider, margin: '12px 16px' }} />

        {/* General */}
        <button
          onClick={() => { setActiveSection('general'); setActiveIntegration(null); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 16px', border: 'none', cursor: 'pointer',
            background: activeSection === 'general' ? s.sidebarActive : 'transparent',
            borderRadius: 0, width: '100%', textAlign: 'left',
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => { if (activeSection !== 'general') e.currentTarget.style.background = s.sidebarHover; }}
          onMouseLeave={(e) => { if (activeSection !== 'general') e.currentTarget.style.background = 'transparent'; }}
        >
          <div style={{
            width: 22, height: 22, borderRadius: 6,
            background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, color: s.textSecondary,
          }}>
            *
          </div>
          <span style={{ fontSize: 13, color: s.text }}>General</span>
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Version footer */}
        <div style={{ padding: '12px 16px', fontSize: 10, color: s.textTertiary, fontFamily: fonts.mono }}>
          Vitals v0.1.0
        </div>
      </div>

      {/* Content */}
      <div style={{
        flex: 1, paddingTop: 50, paddingLeft: 32, paddingRight: 32, paddingBottom: 24,
        overflowY: 'auto', overflowX: 'hidden',
      }}>
        {activeSection === 'integrations' && activeIntegration && (
          <IntegrationDetail
            key={activeIntegration}
            id={activeIntegration}
            connected={connectors.find((c) => c.id === activeIntegration)?.connected || false}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        )}
        {activeSection === 'integrations' && !activeIntegration && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: s.text, marginBottom: 20 }}>Integrations</div>
            <SectionCard>
              <div style={{ fontSize: 13, color: s.textSecondary, lineHeight: 1.5 }}>
                Select an integration from the sidebar to configure it.
              </div>
            </SectionCard>
          </div>
        )}
        {activeSection === 'general' && <GeneralPreferences />}
      </div>
    </div>
  );
}

// ─── Shared styles ───

const inputStyle: React.CSSProperties = {
  flex: 1, background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.1)',
  borderRadius: 8, color: 'rgba(255,255,255,0.92)', fontSize: 13, fontFamily: fonts.mono,
  padding: '8px 12px', outline: 'none',
};

const connectBtnStyle: React.CSSProperties = {
  background: '#34d399', border: 'none', borderRadius: 8, color: '#000',
  fontSize: 13, fontWeight: 600, padding: '8px 18px', cursor: 'pointer',
  transition: 'opacity 0.15s',
};

const ghostBtnStyle: React.CSSProperties = {
  background: 'none', border: '0.5px solid rgba(255,255,255,0.1)',
  borderRadius: 8, color: 'rgba(255,255,255,0.55)', fontSize: 12,
  padding: '6px 12px', cursor: 'pointer',
};
