import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron's app module
vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/vitals-test',
  },
}));

// Mock fs to avoid actual file operations
vi.mock('fs', () => ({
  default: {
    existsSync: () => false,
    mkdirSync: () => {},
    writeFileSync: () => {},
    readFileSync: () => Buffer.from([]),
  },
  existsSync: () => false,
  mkdirSync: () => {},
  writeFileSync: () => {},
  readFileSync: () => Buffer.from([]),
}));

import { addDeploy, getDeploysSince } from '../history-store';
import type { DeployEvent } from '../history-store';

function makeEvent(overrides: Partial<DeployEvent> = {}): DeployEvent {
  return {
    id: `deploy-${Date.now()}-${Math.random()}`,
    provider: 'vercel',
    projectId: 'test-project',
    commitSha: 'abc123',
    status: 'READY',
    conclusion: 'success',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 5000,
    branch: 'main',
    actor: 'test-user',
    metadata: {},
    ...overrides,
  };
}

describe('history-store', () => {
  it('addDeploy + getDeploysSince round-trip', async () => {
    const event = makeEvent({
      id: 'test-roundtrip-1',
      startedAt: new Date().toISOString(),
    });

    await addDeploy(event);

    const since = new Date();
    since.setHours(since.getHours() - 1);
    const results = await getDeploysSince(since.toISOString());

    expect(results.length).toBeGreaterThanOrEqual(1);
    const found = results.find((r) => r.id === 'test-roundtrip-1');
    expect(found).toBeDefined();
    expect(found!.provider).toBe('vercel');
    expect(found!.conclusion).toBe('success');
  });

  it('addDeploy upserts on same id+provider', async () => {
    const event = makeEvent({
      id: 'test-upsert-1',
      conclusion: 'in_progress',
    });
    await addDeploy(event);

    // Update conclusion
    await addDeploy({ ...event, conclusion: 'success' });

    const since = new Date();
    since.setDate(since.getDate() - 1);
    const results = await getDeploysSince(since.toISOString());
    const found = results.filter((r) => r.id === 'test-upsert-1');
    expect(found.length).toBe(1);
    expect(found[0].conclusion).toBe('success');
  });
});
