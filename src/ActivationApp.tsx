import { useState, useEffect, useCallback } from 'react';
import { fonts } from './lib/design-tokens';

const s = {
  bg: '#1c1c1e',
  card: '#2c2c2e',
  cardBorder: 'rgba(255,255,255,0.06)',
  text: 'rgba(255,255,255,0.92)',
  textSecondary: 'rgba(255,255,255,0.55)',
  textTertiary: 'rgba(255,255,255,0.30)',
  accent: '#34d399',
  danger: '#ef4444',
} as const;

declare global {
  interface Window {
    vitals: {
      license: {
        activate: (key: string) => Promise<{ success: boolean; error?: string }>;
        getStatus: () => Promise<{ activated: boolean; key?: string }>;
        deactivate: () => Promise<{ success: boolean }>;
      };
      openExternal: (url: string) => Promise<void>;
      quit: () => Promise<void>;
    };
  }
}

function formatLicenseKey(value: string): string {
  // Accept any format — LemonSqueezy keys are UUIDs or hex strings
  return value.trim();
}

export function ActivationApp() {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Listen for error messages from main process
    const handler = (_event: any, message: string) => {
      setError(message);
    };
    // @ts-ignore
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.on('activation:error', handler);
      return () => ipcRenderer.removeListener('activation:error', handler);
    }
  }, []);

  const handleActivate = useCallback(async () => {
    if (!key || key.length < 10) return;
    setLoading(true);
    setError('');

    try {
      const result = await window.vitals.license.activate(key);
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error || 'Falha na ativação');
      }
    } catch {
      setError('Erro de conexão. Verifique sua internet.');
    } finally {
      setLoading(false);
    }
  }, [key]);

  if (success) {
    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 32,
        fontFamily: fonts.system, color: s.text, WebkitAppRegion: 'drag' as any,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'rgba(52,211,153,0.15)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M9 12l2 2 4-4" stroke={s.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="10" stroke={s.accent} strokeWidth="2" />
          </svg>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Vitals ativado!</h2>
        <p style={{ color: s.textSecondary, fontSize: 13, textAlign: 'center' }}>
          O app será aberto automaticamente.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      fontFamily: fonts.system, color: s.text,
    }}>
      {/* Title bar drag region */}
      <div style={{ height: 52, WebkitAppRegion: 'drag' as any, flexShrink: 0 }} />

      <div style={{ flex: 1, padding: '0 32px 32px', display: 'flex', flexDirection: 'column' }}>
        {/* Logo + title */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'rgba(52,211,153,0.1)', border: `1px solid rgba(52,211,153,0.2)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.accent }} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Vitals</h1>
          <p style={{ color: s.textSecondary, fontSize: 13 }}>Insira sua chave de licença para ativar</p>
        </div>

        {/* License key input */}
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(formatLicenseKey(e.target.value))}
            placeholder="Cole sua chave de licença"
            style={{
              width: '100%', padding: '12px 14px', fontSize: 15,
              fontFamily: fonts.mono, letterSpacing: 1,
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${error ? s.danger : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 10, color: s.text, outline: 'none',
              textAlign: 'center',
              WebkitAppRegion: 'no-drag' as any,
            }}
            onFocus={(e) => { e.target.style.borderColor = error ? s.danger : 'rgba(52,211,153,0.4)'; }}
            onBlur={(e) => { e.target.style.borderColor = error ? s.danger : 'rgba(255,255,255,0.08)'; }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleActivate(); }}
            autoFocus
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 8, padding: '8px 12px', marginBottom: 12,
            color: s.danger, fontSize: 13, textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* Activate button */}
        <button
          onClick={handleActivate}
          disabled={loading || key.length < 10}
          style={{
            width: '100%', padding: '12px 24px', fontSize: 15, fontWeight: 600,
            background: loading || key.length < 10 ? 'rgba(52,211,153,0.3)' : s.accent,
            color: '#000', border: 'none', borderRadius: 10, cursor: loading ? 'wait' : 'pointer',
            opacity: loading || key.length < 10 ? 0.6 : 1,
            transition: 'opacity 0.2s, background 0.2s',
            WebkitAppRegion: 'no-drag' as any,
          }}
        >
          {loading ? 'Ativando...' : 'Ativar'}
        </button>

        {/* Footer links */}
        <div style={{ marginTop: 'auto', textAlign: 'center', paddingTop: 24 }}>
          <button
            onClick={() => window.vitals.openExternal('https://vitals.app')}
            style={{
              background: 'none', border: 'none', color: s.accent,
              fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
              WebkitAppRegion: 'no-drag' as any,
            }}
          >
            Ainda não tem uma licença? Comprar
          </button>
        </div>
      </div>
    </div>
  );
}
