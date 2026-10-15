// Service layer: shared business logic used by both the HTTP routes and the
// MCP tool handlers, so the two surfaces can never drift apart.

import type { Env } from "./env.ts";
import { HttpError } from "./errors.ts";
import { randomMonitorId, randomToken, safeCompare } from "./ids.ts";
import {
  type CreateMonitorInput,
  type BeatInput,
  type PatchMonitorInput,
  validateCreateMonitor,
  validateBeat,
  validatePatchMonitor,
  ValidationError,
} from "./validation.ts";
import { computeState, alertToFire, type MonitorState } from "./state.ts";
import {
  insertMonitor,
  getMonitor,
  recordBeat as dbRecordBeat,
  listBeats,
  uptime24h,
  patchMonitor as dbPatchMonitor,
  deleteMonitor as dbDeleteMonitor,
  rateLimitAllow,
  type MonitorRow,
} from "./db.ts";

function toValidationHttpError(err: unknown): never {
  if (err instanceof ValidationError) throw new HttpError(400, err.message);
  throw err;
}

export interface CreateMonitorResult {
  id: string;
  name: string;
  ingest_token: string;
  manage_token: string;
  grace_seconds: number;
  slow_tps_threshold: number | null;
  webhook_url: string | null;
  public: boolean;
  status_url: string;
  badge_url: string;
  manage_url: string;
}

export async function createMonitor(
  env: Env,
  origin: string,
  input: CreateMonitorInput,
  nowMs: number,
): Promise<CreateMonitorResult> {
  const limit = Number(env.RATE_LIMIT_PER_MINUTE) || 20;
  const allowed = await rateLimitAllow(env.DB, limit, nowMs);
  if (!allowed) {
    throw new HttpError(429, "too many monitors created recently, please slow down");
  }

  let v;
  try {
    v = validateCreateMonitor(input);
  } catch (e) {
    toValidationHttpError(e);
  }

  const id = randomMonitorId();
  const ingest_token = randomToken();
  const manage_token = randomToken();

  await insertMonitor(env.DB, {
    id,
    name: v.name,
    ingest_token,
    manage_token,
    grace_seconds: v.grace_seconds,
    slow_tps_threshold: v.slow_tps_threshold,
    webhook_url: v.webhook_url,
    is_public: v.public,
    created_at: nowMs,
  });

  return {
    id,
    name: v.name,
    ingest_token,
    manage_token,
    grace_seconds: v.grace_seconds,
    slow_tps_threshold: v.slow_tps_threshold,
    webhook_url: v.webhook_url,
    public: v.public,
    status_url: `${origin}/v1/monitors/${id}/status`,
    badge_url: `${origin}/badge/${id}.svg`,
    manage_url: `${origin}/s/${id}`,
  };
}

function rowState(m: MonitorRow): {
  last_beat_at: number | null;
  last_ok: boolean | null;
  last_tps: number | null;
  slow_tps_threshold: number | null;
  grace_seconds: number;
} {
  return {
    last_beat_at: m.last_beat_at,
    last_ok: m.last_ok === null ? null : m.last_ok === 1,
    last_tps: m.last_tps,
    slow_tps_threshold: m.slow_tps_threshold,
    grace_seconds: m.grace_seconds,
  };
}

export async function recordBeat(
  env: Env,
  id: string,
  authToken: string | null,
  input: BeatInput,
  nowMs: number,
): Promise<{ state: MonitorState }> {
  const monitor = await getMonitor(env.DB, id);
  if (!monitor) throw new HttpError(404, "monitor not found");
  if (!authToken || !safeCompare(authToken, monitor.ingest_token)) {
    throw new HttpError(401, "invalid or missing ingest token");
  }

  let beat;
  try {
    beat = validateBeat(input);
  } catch (e) {
    toValidationHttpError(e);
  }

  const newState = computeState(nowMs, {
    last_beat_at: nowMs,
    last_ok: beat.ok,
    last_tps: beat.tokens_per_sec,
    slow_tps_threshold: monitor.slow_tps_threshold,
    grace_seconds: monitor.grace_seconds,
  });
  const stateChanged = newState !== monitor.state;

  await dbRecordBeat(env.DB, id, beat, nowMs, newState, stateChanged);

  return { state: newState };
}

export interface StatusResult {
  id: string;
  name: string;
  state: MonitorState;
  last_beat_at: string | null;
  last_tps: number | null;
  last_latency_ms: number | null;
  last_models: string[] | null;
  last_note: string | null;
  uptime_24h: number | null;
  grace_seconds: number;
  slow_tps_threshold: number | null;
  public: boolean;
  created_at: string;
}

function canView(monitor: MonitorRow, manageToken: string | null): boolean {
  if (monitor.is_public) return true;
  return !!manageToken && safeCompare(manageToken, monitor.manage_token);
}

export async function getStatus(
  env: Env,
  id: string,
  manageToken: string | null,
  nowMs: number,
): Promise<StatusResult> {
  const monitor = await getMonitor(env.DB, id);
  if (!monitor) throw new HttpError(404, "monitor not found");
  if (!canView(monitor, manageToken)) {
    throw new HttpError(401, "this monitor is private; pass its manage token");
  }

  // Recompute state live so status reflects grace-period expiry even
  // between cron ticks.
  const liveState = computeState(nowMs, rowState(monitor));
  const uptime = await uptime24h(env.DB, id, nowMs);

  return {
    id: monitor.id,
    name: monitor.name,
    state: liveState,
    last_beat_at: monitor.last_beat_at ? new Date(monitor.last_beat_at).toISOString() : null,
    last_tps: monitor.last_tps,
    last_latency_ms: monitor.last_latency_ms,
    last_models: monitor.last_models ? JSON.parse(monitor.last_models) : null,
    last_note: monitor.last_note,
    uptime_24h: uptime,
    grace_seconds: monitor.grace_seconds,
    slow_tps_threshold: monitor.slow_tps_threshold,
    public: !!monitor.is_public,
    created_at: new Date(monitor.created_at).toISOString(),
  };
}

export interface HeartbeatResult {
  created_at: string;
  ok: boolean;
  models: string[] | null;
  tokens_per_sec: number | null;
  latency_ms: number | null;
  note: string | null;
}

export async function listHeartbeats(
  env: Env,
  id: string,
  manageToken: string | null,
  limit: number,
): Promise<HeartbeatResult[]> {
  const monitor = await getMonitor(env.DB, id);
  if (!monitor) throw new HttpError(404, "monitor not found");
  if (!canView(monitor, manageToken)) {
    throw new HttpError(401, "this monitor is private; pass its manage token");
  }

  const capped = Math.max(1, Math.min(limit || 50, 500));
  const beats = await listBeats(env.DB, id, capped);
  return beats.map((b) => ({
    created_at: new Date(b.created_at).toISOString(),
    ok: b.ok === 1,
    models: b.models ? JSON.parse(b.models) : null,
    tokens_per_sec: b.tokens_per_sec,
    latency_ms: b.latency_ms,
    note: b.note,
  }));
}

export async function patchMonitor(
  env: Env,
  id: string,
  manageToken: string | null,
  input: PatchMonitorInput,
): Promise<void> {
  const monitor = await getMonitor(env.DB, id);
  if (!monitor) throw new HttpError(404, "monitor not found");
  if (!manageToken || !safeCompare(manageToken, monitor.manage_token)) {
    throw new HttpError(401, "invalid or missing manage token");
  }

  let fields;
  try {
    fields = validatePatchMonitor(input);
  } catch (e) {
    toValidationHttpError(e);
  }

  await dbPatchMonitor(env.DB, id, fields);
}

export async function deleteMonitor(env: Env, id: string, manageToken: string | null): Promise<void> {
  const monitor = await getMonitor(env.DB, id);
  if (!monitor) throw new HttpError(404, "monitor not found");
  if (!manageToken || !safeCompare(manageToken, monitor.manage_token)) {
    throw new HttpError(401, "invalid or missing manage token");
  }
  await dbDeleteMonitor(env.DB, id);
}

export async function getPublicMonitorForPage(env: Env, id: string, nowMs: number): Promise<StatusResult | null> {
  const monitor = await getMonitor(env.DB, id);
  if (!monitor || !monitor.is_public) return null;
  return getStatus(env, id, null, nowMs);
}

export type BadgeState = MonitorState | "private" | "not_found";

/** Badge rendering never requires a token, so it must never leak a private monitor's state. */
export async function getBadgeState(env: Env, id: string, nowMs: number): Promise<BadgeState> {
  const monitor = await getMonitor(env.DB, id);
  if (!monitor) return "not_found";
  if (!monitor.is_public) return "private";
  return computeState(nowMs, rowState(monitor));
}

export { alertToFire };
