/**
 * Secure token storage using Electron's safeStorage API (macOS Keychain).
 *
 * Tokens are stored as encrypted buffers in a JSON file. The encryption key
 * lives in the system keychain — it's NOT hardcoded in source.
 *
 * Migration: on first run after upgrade, tokens from the old electron-store
 * (with hardcoded encryptionKey) are migrated here automatically.
 */

import { safeStorage, app } from 'electron';
import fs from 'fs';
import path from 'path';

const SECURE_FILE = path.join(app.getPath('userData'), 'secure-tokens.json');

type ServiceKey = 'github' | 'vercel' | 'sentry' | 'openai' | 'anthropic' | 'datadog' | 'supabase' | 'chrome';

interface SecureTokenFile {
  version: 1;
  tokens: Partial<Record<ServiceKey, string>>; // base64-encoded encrypted buffers
}

function readFile(): SecureTokenFile {
  try {
    if (fs.existsSync(SECURE_FILE)) {
      const raw = fs.readFileSync(SECURE_FILE, 'utf-8');
      return JSON.parse(raw) as SecureTokenFile;
    }
  } catch (err) {
    console.error('[vitals:secure-store] Failed to read secure file:', err);
  }
  return { version: 1, tokens: {} };
}

function writeFile(data: SecureTokenFile): void {
  try {
    const dir = path.dirname(SECURE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SECURE_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch (err) {
    console.error('[vitals:secure-store] Failed to write secure file:', err);
  }
}

export function getSecureToken(service: ServiceKey): string | undefined {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[vitals:secure-store] safeStorage encryption not available, falling back to plaintext');
    const data = readFile();
    // If encryption isn't available, tokens are stored as plaintext base64
    const raw = data.tokens[service];
    return raw ? Buffer.from(raw, 'base64').toString('utf-8') : undefined;
  }

  const data = readFile();
  const encrypted = data.tokens[service];
  if (!encrypted) return undefined;

  try {
    const buffer = Buffer.from(encrypted, 'base64');
    return safeStorage.decryptString(buffer);
  } catch (err) {
    console.error(`[vitals:secure-store] Failed to decrypt token for ${service}:`, err);
    return undefined;
  }
}

export function setSecureToken(service: ServiceKey, token: string): void {
  const data = readFile();

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token);
    data.tokens[service] = encrypted.toString('base64');
  } else {
    // Fallback: store as base64 (not truly secure, but better than plaintext JSON)
    console.warn('[vitals:secure-store] safeStorage not available, storing token with base64 encoding only');
    data.tokens[service] = Buffer.from(token, 'utf-8').toString('base64');
  }

  writeFile(data);
}

export function removeSecureToken(service: ServiceKey): void {
  const data = readFile();
  delete data.tokens[service];
  writeFile(data);
}

export function getAllSecureTokenStatus(): Record<string, boolean> {
  const data = readFile();
  const result: Record<string, boolean> = {};
  const services: ServiceKey[] = ['github', 'vercel', 'sentry', 'openai', 'anthropic', 'datadog', 'supabase', 'chrome'];
  for (const s of services) {
    result[s] = !!data.tokens[s];
  }
  return result;
}

/**
 * Migrate tokens from old electron-store (hardcoded encryptionKey) to safeStorage.
 * Called once on app startup. Idempotent — skips if already migrated.
 */
export async function migrateFromElectronStore(): Promise<void> {
  const MIGRATION_FLAG = path.join(app.getPath('userData'), '.tokens-migrated');

  if (fs.existsSync(MIGRATION_FLAG)) return;

  console.log('[vitals:secure-store] Checking for tokens to migrate from electron-store...');

  try {
    // Dynamically import electron-store to read old tokens
    const ElectronStore = (await import('electron-store')).default;
    const oldStore: any = new ElectronStore({
      name: 'vitals-config',
      encryptionKey: 'vitals-v1-local-encryption',
    });

    const oldTokens = oldStore.get('tokens') as Partial<Record<ServiceKey, string>> | undefined;

    if (oldTokens) {
      let migrated = 0;
      for (const [service, token] of Object.entries(oldTokens)) {
        if (token && typeof token === 'string') {
          setSecureToken(service as ServiceKey, token);
          migrated++;
        }
      }

      if (migrated > 0) {
        console.log(`[vitals:secure-store] Migrated ${migrated} token(s) to safeStorage`);
        // Clear old tokens from electron-store
        oldStore.delete('tokens');
      }
    }
  } catch (err) {
    console.error('[vitals:secure-store] Migration failed (non-fatal):', err);
  }

  // Mark as migrated even on error — don't retry endlessly
  try {
    fs.writeFileSync(MIGRATION_FLAG, new Date().toISOString(), { mode: 0o600 });
  } catch {}
}
