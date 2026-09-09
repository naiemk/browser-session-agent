import { DatabaseSync } from "node:sqlite";

export const SCHEMA_VERSION = 1;

export function applyMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const row = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as
    | { v: number | null }
    | undefined;
  const current = row?.v ?? 0;
  if (current >= SCHEMA_VERSION) return;

  db.exec(`
    BEGIN;
    CREATE TABLE IF NOT EXISTS jobs (
      job_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      objective TEXT NOT NULL,
      lifecycle TEXT NOT NULL,
      case_mode TEXT NOT NULL,
      active_spec_version INTEGER,
      active_spec_hash TEXT,
      draft_spec_version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      paused_at TEXT,
      completed_at TEXT,
      next_wake_at TEXT
    );
    CREATE TABLE IF NOT EXISTS spec_versions (
      job_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      hash TEXT,
      canonical_bytes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      approved_at TEXT,
      PRIMARY KEY (job_id, version)
    );
    CREATE TABLE IF NOT EXISTS cases (
      job_id TEXT NOT NULL,
      case_key TEXT NOT NULL,
      label TEXT NOT NULL,
      stage TEXT NOT NULL,
      facts_json TEXT NOT NULL,
      outcome_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (job_id, case_key)
    );
    CREATE TABLE IF NOT EXISTS work_items (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      case_key TEXT,
      template_id TEXT NOT NULL,
      spec_version INTEGER NOT NULL,
      spec_hash TEXT NOT NULL,
      objective TEXT NOT NULL,
      status TEXT NOT NULL,
      dependencies_json TEXT NOT NULL,
      resource_key TEXT,
      attempts INTEGER NOT NULL,
      max_attempts INTEGER NOT NULL,
      deferred_until TEXT,
      checkpoint_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_work_ready ON work_items(status, deferred_until);
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      work_item_id TEXT NOT NULL,
      fence_token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      lease_expires_at TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      outcome_json TEXT,
      cost_usd REAL NOT NULL DEFAULT 0,
      turns INTEGER NOT NULL DEFAULT 0,
      site_actions INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS effects (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      work_item_id TEXT NOT NULL,
      attempt_id TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      identity_key TEXT NOT NULL,
      destination TEXT,
      evidence_json TEXT NOT NULL,
      prepared_at TEXT NOT NULL,
      dispatched_at TEXT,
      observed_at TEXT,
      reconciled_at TEXT,
      UNIQUE (job_id, identity_key)
    );
    CREATE INDEX IF NOT EXISTS idx_effects_identity ON effects(job_id, identity_key);
    CREATE TABLE IF NOT EXISTS human_requests (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      perishable INTEGER NOT NULL,
      work_item_id TEXT,
      case_key TEXT,
      resource_key TEXT NOT NULL,
      reason TEXT NOT NULL,
      handoff TEXT NOT NULL,
      checkpoint_json TEXT,
      resolution TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_human_open ON human_requests(job_id, status);
    CREATE TABLE IF NOT EXISTS resources (
      key TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      failures INTEGER NOT NULL,
      not_before TEXT,
      circuit_open_until TEXT,
      window_actions INTEGER NOT NULL,
      window_cost_usd REAL NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_resources_breaker ON resources(circuit_open_until);
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      at TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      evidence_refs TEXT
    );
    CREATE TABLE IF NOT EXISTS grant_usage (
      job_id TEXT NOT NULL,
      grant_id TEXT NOT NULL,
      used INTEGER NOT NULL,
      PRIMARY KEY (job_id, grant_id)
    );
    INSERT INTO schema_migrations(version, applied_at) VALUES (${SCHEMA_VERSION}, datetime('now'));
    COMMIT;
  `);
}

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  applyMigrations(db);
  return db;
}

/** STORE-02 canary */
export function runSqliteCanary(): { ok: true; detail: string } | { ok: false; detail: string } {
  try {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT);");
    db.prepare("INSERT INTO t(v) VALUES (?)").run("canary");
    const row = db.prepare("SELECT v FROM t WHERE id = 1").get() as { v: string };
    db.close();
    if (row.v !== "canary") return { ok: false, detail: "unexpected row" };
    return { ok: true, detail: "node:sqlite DatabaseSync ok" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
