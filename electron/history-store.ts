/**
 * Deploy history persistence using SQLite (sql.js / WASM).
 *
 * Stores every deploy/action event for streak calculation, heatmap,
 * and future analytics (Wrapped, patterns, etc).
 *
 * File: ~/Library/Application Support/vitals/history.db
 */

import initSqlJs, { type Database } from 'sql.js';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(app.getPath('userData'), 'history.db');

let db: Database | null = null;
let sqlJsReady: Promise<void> | null = null;

export interface DeployEvent {
  id: string;
  provider: string;
  projectId: string;
  commitSha: string;
  status: string;
  conclusion: 'success' | 'failure' | 'cancelled' | 'in_progress';
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  branch: string;
  actor: string;
  metadata: Record<string, any>;
}

function persist(): void {
  if (!db) return;
  const data = db.export();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function ensureDb(): Promise<Database> {
  if (db) return db;

  if (!sqlJsReady) {
    sqlJsReady = (async () => {
      const SQL = await initSqlJs();
      let fileBuffer: Buffer | null = null;
      if (fs.existsSync(DB_PATH)) {
        fileBuffer = fs.readFileSync(DB_PATH);
      }
      db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
      db.run('PRAGMA journal_mode = WAL');
      db.run('PRAGMA foreign_keys = ON');
      runMigrations(db);
    })();
  }

  await sqlJsReady;
  return db!;
}

function runMigrations(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set<string>();
  const rows = database.exec('SELECT name FROM _migrations');
  if (rows.length > 0) {
    for (const row of rows[0].values) {
      applied.add(row[0] as string);
    }
  }

  const migrations: Array<{ name: string; sql: string }> = [
    {
      name: '001_create_deploys',
      sql: `
        CREATE TABLE deploys (
          id TEXT NOT NULL,
          provider TEXT NOT NULL,
          project_id TEXT NOT NULL,
          commit_sha TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT '',
          conclusion TEXT NOT NULL DEFAULT 'in_progress',
          started_at TEXT NOT NULL,
          completed_at TEXT,
          duration_ms INTEGER,
          branch TEXT NOT NULL DEFAULT '',
          actor TEXT NOT NULL DEFAULT '',
          metadata TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (id, provider)
        );

        CREATE INDEX idx_deploys_conclusion_started ON deploys(conclusion, started_at);
        CREATE INDEX idx_deploys_provider ON deploys(provider);
        CREATE INDEX idx_deploys_started_at ON deploys(started_at);
      `,
    },
  ];

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    database.run(migration.sql);
    database.run('INSERT INTO _migrations (name) VALUES (?)', [migration.name]);
    console.log(`[vitals:history] Applied migration: ${migration.name}`);
  }
}

function queryRows(database: Database, sql: string, params: any[] = []): any[] {
  const stmt = database.prepare(sql);
  stmt.bind(params);
  const results: any[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Add a deploy event. Upserts — if same id+provider exists, updates it.
 */
export async function addDeploy(event: DeployEvent): Promise<void> {
  const database = await ensureDb();
  database.run(`
    INSERT INTO deploys (id, provider, project_id, commit_sha, status, conclusion, started_at, completed_at, duration_ms, branch, actor, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id, provider) DO UPDATE SET
      status = excluded.status,
      conclusion = excluded.conclusion,
      completed_at = excluded.completed_at,
      duration_ms = excluded.duration_ms,
      metadata = excluded.metadata
  `, [
    event.id,
    event.provider,
    event.projectId,
    event.commitSha,
    event.status,
    event.conclusion,
    event.startedAt,
    event.completedAt,
    event.durationMs,
    event.branch,
    event.actor,
    JSON.stringify(event.metadata),
  ]);
  persist();
}

/**
 * Get all successful deploys since a given timestamp.
 */
export async function getDeploysSince(sinceIso: string): Promise<DeployEvent[]> {
  const database = await ensureDb();
  const rows = queryRows(database, `
    SELECT * FROM deploys
    WHERE conclusion = 'success' AND started_at >= ?
    ORDER BY started_at DESC
  `, [sinceIso]);
  return rows.map(rowToEvent);
}

/**
 * Get deploys for a specific "vitals day" (adjusted by cutoff hour).
 */
export async function getDeploysByDay(dateStr: string, cutoffHour: number = 4): Promise<DeployEvent[]> {
  const database = await ensureDb();
  const dayStart = `${dateStr}T${String(cutoffHour).padStart(2, '0')}:00:00`;
  const nextDate = new Date(dateStr);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().split('T')[0];
  const dayEnd = `${nextDateStr}T${String(cutoffHour).padStart(2, '0')}:00:00`;

  const rows = queryRows(database, `
    SELECT * FROM deploys
    WHERE conclusion = 'success' AND started_at >= ? AND started_at < ?
    ORDER BY started_at DESC
  `, [dayStart, dayEnd]);
  return rows.map(rowToEvent);
}

/**
 * Get all successful deploys (for streak calculation).
 * Limited to last 400 days for performance.
 */
export async function getAllSuccessfulDeploys(): Promise<DeployEvent[]> {
  const database = await ensureDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 400);

  const rows = queryRows(database, `
    SELECT * FROM deploys
    WHERE conclusion = 'success' AND started_at >= ?
    ORDER BY started_at DESC
  `, [cutoff.toISOString()]);
  return rows.map(rowToEvent);
}

/**
 * Get deploy counts per day for heatmap (last N days).
 */
export async function getDeployCountsByDay(days: number = 365): Promise<Array<{ date: string; count: number }>> {
  const database = await ensureDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const rows = queryRows(database, `
    SELECT date(started_at) as date, COUNT(*) as count
    FROM deploys
    WHERE conclusion = 'success' AND started_at >= ?
    GROUP BY date(started_at)
    ORDER BY date ASC
  `, [cutoff.toISOString()]);
  return rows.map((r: any) => ({ date: r.date, count: r.count }));
}

/**
 * Check if a deploy already exists (for deduplication).
 */
export async function deployExists(id: string, provider: string): Promise<boolean> {
  const database = await ensureDb();
  const rows = queryRows(database, 'SELECT 1 FROM deploys WHERE id = ? AND provider = ? LIMIT 1', [id, provider]);
  return rows.length > 0;
}

function rowToEvent(row: any): DeployEvent {
  return {
    id: row.id,
    provider: row.provider,
    projectId: row.project_id,
    commitSha: row.commit_sha,
    status: row.status,
    conclusion: row.conclusion,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    branch: row.branch,
    actor: row.actor,
    metadata: JSON.parse(row.metadata || '{}'),
  };
}

/**
 * Close the database (for graceful shutdown).
 */
export function closeHistoryDb(): void {
  if (db) {
    persist();
    db.close();
    db = null;
    sqlJsReady = null;
  }
}
