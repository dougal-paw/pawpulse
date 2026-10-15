import type { Env } from "./env.ts";
import type { MonitorState } from "./state.ts";
import type { ValidatedBeat } from "./validation.ts";

export interface MonitorRow {
  id: string;
  name: string;
  ingest_token: string;
  manage_token: string;
  grace_seconds: number;
  slow_tps_threshold: number | null;
  webhook_url: string | null;
  is_public: number;
  created_at: number;
  last_beat_at: number | null;
  last_ok: number | null;
  last_tps: number | null;
  last_latency_ms: number | null;
  last_models: string | null;
  last_note: string | null;
  state: MonitorState;
  last_state_change_at: number | null;
  alerted_state: MonitorState | null;
}

export interface BeatRow {
  id: number;
  monitor_id: string;
  created_at: number;
  ok: number;
  models: string | null;
  tokens_per_sec: number | null;
  latency_ms: number | null;
  note: string | null;
}

const MAX_BEATS_PER_MONITOR = 500;

export interface NewMonitor {
  id: string;
  name: string;
  ingest_token: string;
  manage_token: string;
  grace_seconds: number;
  slow_tps_threshold: number | null;
  webhook_url: string | null;
  is_public: boolean;
  created_at: number;
}

export async function insertMonitor(db: D1Database, m: NewMonitor): Promise<void> {
  await db
    .prepare(
      `INSERT INTO monitors
        (id, name, ingest_token, manage_token, grace_seconds, slow_tps_threshold,
         webhook_url, is_public, created_at, state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
    )
    .bind(
      m.id,
      m.name,
      m.ingest_token,
      m.manage_token,
      m.grace_seconds,
      m.slow_tps_threshold,
      m.webhook_url,
      m.is_public ? 1 : 0,
      m.created_at,
    )
    .run();
}

export async function getMonitor(db: D1Database, id: string): Promise<MonitorRow | null> {
  const row = await db.prepare(`SELECT * FROM monitors WHERE id = ?`).bind(id).first<MonitorRow>();
  return row ?? null;
}

export async function recordBeat(
  db: D1Database,
  monitorId: string,
  beat: ValidatedBeat,
  nowMs: number,
  newState: MonitorState,
  stateChanged: boolean,
): Promise<void> {
  const statements = [
    db
      .prepare(
        `INSERT INTO beats (monitor_id, created_at, ok, models, tokens_per_sec, latency_ms, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        monitorId,
        nowMs,
        beat.ok ? 1 : 0,
        beat.models ? JSON.stringify(beat.models) : null,
        beat.tokens_per_sec,
        beat.latency_ms,
        beat.note,
      ),
    db
      .prepare(
        `DELETE FROM beats WHERE monitor_id = ? AND id NOT IN (
           SELECT id FROM beats WHERE monitor_id = ? ORDER BY created_at DESC LIMIT ?
         )`,
      )
      .bind(monitorId, monitorId, MAX_BEATS_PER_MONITOR),
  ];

  if (stateChanged) {
    statements.push(
      db
        .prepare(
          `UPDATE monitors SET last_beat_at = ?, last_ok = ?, last_tps = ?, last_latency_ms = ?,
             last_models = ?, last_note = ?, state = ?, last_state_change_at = ?
           WHERE id = ?`,
        )
        .bind(
          nowMs,
          beat.ok ? 1 : 0,
          beat.tokens_per_sec,
          beat.latency_ms,
          beat.models ? JSON.stringify(beat.models) : null,
          beat.note,
          newState,
          nowMs,
          monitorId,
        ),
    );
  } else {
    statements.push(
      db
        .prepare(
          `UPDATE monitors SET last_beat_at = ?, last_ok = ?, last_tps = ?, last_latency_ms = ?,
             last_models = ?, last_note = ?, state = ?
           WHERE id = ?`,
        )
        .bind(
          nowMs,
          beat.ok ? 1 : 0,
          beat.tokens_per_sec,
          beat.latency_ms,
          beat.models ? JSON.stringify(beat.models) : null,
          beat.note,
          newState,
          monitorId,
        ),
    );
  }

  await db.batch(statements);
}

export async function listBeats(db: D1Database, monitorId: string, limit: number): Promise<BeatRow[]> {
  const res = await db
    .prepare(`SELECT * FROM beats WHERE monitor_id = ? ORDER BY created_at DESC LIMIT ?`)
    .bind(monitorId, limit)
    .all<BeatRow>();
  return res.results ?? [];
}

export async function uptime24h(db: D1Database, monitorId: string, nowMs: number): Promise<number | null> {
  const since = nowMs - 24 * 60 * 60 * 1000;
  const res = await db
    .prepare(
      `SELECT COUNT(*) as total, SUM(ok) as ok_count FROM beats WHERE monitor_id = ? AND created_at >= ?`,
    )
    .bind(monitorId, since)
    .first<{ total: number; ok_count: number | null }>();
  if (!res || res.total === 0) return null;
  return (res.ok_count ?? 0) / res.total;
}

export interface PatchFields {
  name?: string;
  grace_seconds?: number;
  slow_tps_threshold?: number | null;
  webhook_url?: string | null;
  public?: boolean;
}

export async function patchMonitor(db: D1Database, id: string, fields: PatchFields): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (fields.name !== undefined) {
    sets.push("name = ?");
    values.push(fields.name);
  }
  if (fields.grace_seconds !== undefined) {
    sets.push("grace_seconds = ?");
    values.push(fields.grace_seconds);
  }
  if (fields.slow_tps_threshold !== undefined) {
    sets.push("slow_tps_threshold = ?");
    values.push(fields.slow_tps_threshold);
  }
  if (fields.webhook_url !== undefined) {
    sets.push("webhook_url = ?");
    values.push(fields.webhook_url);
  }
  if (fields.public !== undefined) {
    sets.push("is_public = ?");
    values.push(fields.public ? 1 : 0);
  }

  if (sets.length === 0) return;

  values.push(id);
  await db
    .prepare(`UPDATE monitors SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function deleteMonitor(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM beats WHERE monitor_id = ?`).bind(id),
    db.prepare(`DELETE FROM monitors WHERE id = ?`).bind(id),
  ]);
}

/** Monitors that might need a cron-driven state recompute: anything not already new. */
export async function listMonitorsForSweep(db: D1Database, limit: number): Promise<MonitorRow[]> {
  const res = await db
    .prepare(`SELECT * FROM monitors WHERE last_beat_at IS NOT NULL LIMIT ?`)
    .bind(limit)
    .all<MonitorRow>();
  return res.results ?? [];
}

export async function updateMonitorSweepState(
  db: D1Database,
  id: string,
  state: MonitorState,
  stateChanged: boolean,
  nowMs: number,
  alertedState: MonitorState | null,
): Promise<void> {
  if (stateChanged) {
    await db
      .prepare(
        `UPDATE monitors SET state = ?, last_state_change_at = ?, alerted_state = ? WHERE id = ?`,
      )
      .bind(state, nowMs, alertedState, id)
      .run();
  } else {
    await db
      .prepare(`UPDATE monitors SET alerted_state = ? WHERE id = ?`)
      .bind(alertedState, id)
      .run();
  }
}

export async function setAlertedState(db: D1Database, id: string, alertedState: MonitorState): Promise<void> {
  await db.prepare(`UPDATE monitors SET alerted_state = ? WHERE id = ?`).bind(alertedState, id).run();
}

/** Crude global per-minute rate limiter stored in D1. Returns true if allowed. */
export async function rateLimitAllow(db: D1Database, limitPerMinute: number, nowMs: number): Promise<boolean> {
  const bucket = Math.floor(nowMs / 60000);
  // Best-effort: D1 doesn't have atomic upsert-with-check in one round trip without a unique
  // constraint; use INSERT ... ON CONFLICT to increment, then read back the count.
  await db
    .prepare(
      `INSERT INTO rate_limits (bucket, count) VALUES (?, 1)
       ON CONFLICT(bucket) DO UPDATE SET count = count + 1`,
    )
    .bind(bucket)
    .run();
  const row = await db
    .prepare(`SELECT count FROM rate_limits WHERE bucket = ?`)
    .bind(bucket)
    .first<{ count: number }>();
  // Opportunistically clean up old buckets so the table doesn't grow forever.
  await db.prepare(`DELETE FROM rate_limits WHERE bucket < ?`).bind(bucket - 5).run();
  return (row?.count ?? 1) <= limitPerMinute;
}
