import "server-only";
/**
 * Server persistence: SQLite via Node's built-in `node:sqlite` (no native deps).
 * Stores forecasts (immutable once complete — reopening a Verse shows the
 * original analysis, never a silent regeneration) and a JSON snapshot of the
 * client's universe so it survives a browser storage wipe.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Forecast } from "@/lib/domain/types";

const DB_PATH = process.env.FORK_DB_PATH ?? join(process.cwd(), ".data", "fork.sqlite");

let db: DatabaseSync | null = null;
function conn() {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS forecasts (
      id TEXT PRIMARY KEY,
      verse_id TEXT NOT NULL,
      target_key TEXT NOT NULL,
      status TEXT NOT NULL,
      engine TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS forecasts_verse ON forecasts(verse_id, target_key);
    CREATE TABLE IF NOT EXISTS universes (
      id TEXT PRIMARY KEY,
      body TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS research_cache (
      key TEXT PRIMARY KEY,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

export function saveForecast(f: Forecast) {
  const now = new Date().toISOString();
  conn()
    .prepare(
      `INSERT INTO forecasts (id, verse_id, target_key, status, engine, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status=excluded.status, body=excluded.body, updated_at=excluded.updated_at`,
    )
    .run(f.id, f.verseId, `${f.targetEventId}::${f.targetOutcome}`, f.status, f.engine, JSON.stringify(f), f.generatedAt, now);
}

export function loadForecast(id: string): Forecast | null {
  const row = conn().prepare(`SELECT body FROM forecasts WHERE id = ?`).get(id) as { body: string } | undefined;
  return row ? (JSON.parse(row.body) as Forecast) : null;
}

export function saveUniverse(id: string, body: unknown) {
  conn()
    .prepare(`INSERT INTO universes (id, body, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at`)
    .run(id, JSON.stringify(body), new Date().toISOString());
}

export function loadUniverse(id: string): unknown | null {
  const row = conn().prepare(`SELECT body FROM universes WHERE id = ?`).get(id) as { body: string } | undefined;
  return row ? JSON.parse(row.body) : null;
}

/** Research digests are reused across Verses/targets for 6h (same scenario+target text). */
export function getResearch(key: string): unknown | null {
  const row = conn().prepare(`SELECT body, created_at FROM research_cache WHERE key = ?`).get(key) as
    | { body: string; created_at: string }
    | undefined;
  if (!row || Date.now() - new Date(row.created_at).getTime() > 6 * 3600_000) return null;
  return JSON.parse(row.body);
}
export function putResearch(key: string, body: unknown) {
  conn()
    .prepare(`INSERT INTO research_cache (key, body, created_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET body=excluded.body, created_at=excluded.created_at`)
    .run(key, JSON.stringify(body), new Date().toISOString());
}
