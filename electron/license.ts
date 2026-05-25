import { execSync } from 'child_process';
import crypto from 'crypto';
import { app } from 'electron';

const LEMON_API = 'https://api.lemonsqueezy.com/v1/licenses';
const GRACE_PERIOD_MS = 72 * 60 * 60 * 1000; // 72 hours

// LemonSqueezy product IDs — reject keys from other products
const VALID_PRODUCT_IDS = [
  1059547, // dev
];

const isDev = !app.isPackaged;
const isBeta = app.getVersion().includes('beta');

const headers = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

/**
 * Get a stable machine fingerprint from the Mac's serial number
 */
export function getMachineId(): string {
  try {
    const serial = execSync(
      "ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformSerialNumber/ { print $3 }'",
      { encoding: 'utf-8' },
    )
      .trim()
      .replace(/"/g, '');

    return crypto.createHash('sha256').update(`vitals:${serial}`).digest('hex').slice(0, 32);
  } catch {
    // Fallback: use hostname + username hash
    const fallback = `${process.env.USER || 'unknown'}@${execSync('hostname', { encoding: 'utf-8' }).trim()}`;
    return crypto.createHash('sha256').update(`vitals:${fallback}`).digest('hex').slice(0, 32);
  }
}

interface LicenseStore {
  key?: string;
  instanceId?: string;
  lastValidatedAt?: number;
  machineId?: string;
}

/**
 * Activate a license key on LemonSqueezy
 */
export async function activateLicense(
  licenseKey: string,
  setLicense: (data: LicenseStore) => Promise<void>,
): Promise<{ success: boolean; error?: string }> {
  const machineId = getMachineId();

  if (isDev || isBeta) {
    await setLicense({
      key: licenseKey,
      instanceId: 'dev-instance',
      machineId,
      lastValidatedAt: Date.now(),
    });
    return { success: true };
  }

  try {
    const response = await fetch(`${LEMON_API}/activate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        license_key: licenseKey,
        instance_name: machineId,
      }),
    });

    const data = await response.json();

    if (data.activated) {
      // Reject keys from other products
      if (!VALID_PRODUCT_IDS.includes(data.meta?.product_id)) {
        // Deactivate the instance we just created
        await fetch(`${LEMON_API}/deactivate`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ license_key: licenseKey, instance_id: data.instance.id }),
        }).catch(() => {});
        return { success: false, error: 'Chave de licença inválida para este produto' };
      }

      await setLicense({
        key: licenseKey,
        instanceId: data.instance.id,
        machineId,
        lastValidatedAt: Date.now(),
      });
      return { success: true };
    }

    return { success: false, error: data.error || 'Falha na ativação' };
  } catch {
    return { success: false, error: 'Erro de conexão. Verifique sua internet.' };
  }
}

/**
 * Validate a license key on LemonSqueezy
 */
export async function validateLicenseOnline(
  licenseKey: string,
  instanceId: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch(`${LEMON_API}/validate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        license_key: licenseKey,
        instance_id: instanceId,
      }),
    });

    const data = await response.json();

    if (data.valid && data.license_key.status === 'active') {
      // Reject keys from other products
      if (!VALID_PRODUCT_IDS.includes(data.meta?.product_id)) {
        return { valid: false, error: 'Chave de licença inválida para este produto' };
      }
      return { valid: true };
    }

    return { valid: false, error: data.error || 'Licença inválida' };
  } catch {
    return { valid: false, error: 'network_error' };
  }
}

/**
 * Deactivate a license instance on LemonSqueezy
 */
export async function deactivateLicense(
  licenseKey: string,
  instanceId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${LEMON_API}/deactivate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        license_key: licenseKey,
        instance_id: instanceId,
      }),
    });

    const data = await response.json();

    if (data.deactivated) {
      return { success: true };
    }

    return { success: false, error: data.error || 'Falha ao desativar' };
  } catch {
    return { success: false, error: 'Erro de conexão' };
  }
}

/**
 * Check if the license is valid, using store + online + grace period
 */
export async function isLicenseValid(
  getLicense: () => Promise<LicenseStore>,
  setLicense: (data: LicenseStore) => Promise<void>,
): Promise<{ valid: boolean; error?: string; needsActivation: boolean }> {
  if (isDev || isBeta) {
    return { valid: true, needsActivation: false };
  }

  const license = await getLicense();

  if (!license.key || !license.instanceId) {
    return { valid: false, error: 'Nenhuma licença encontrada', needsActivation: true };
  }

  // Attempt online validation
  const result = await validateLicenseOnline(license.key, license.instanceId);

  if (result.valid) {
    await setLicense({
      ...license,
      lastValidatedAt: Date.now(),
    });
    return { valid: true, needsActivation: false };
  }

  // If network error, check grace period
  if (result.error === 'network_error' && license.lastValidatedAt) {
    const elapsed = Date.now() - license.lastValidatedAt;
    if (elapsed < GRACE_PERIOD_MS) {
      return { valid: true, needsActivation: false };
    }
    return {
      valid: false,
      error: 'Validação de licença expirada. Conecte à internet.',
      needsActivation: false,
    };
  }

  return { valid: false, error: result.error, needsActivation: true };
}
