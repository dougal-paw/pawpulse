// Pure input-validation logic. No I/O, no Workers APIs.

export class ValidationError extends Error {}

const NAME_MAX = 100;
const NOTE_MAX = 200;
const GRACE_MIN = 60;
const GRACE_MAX = 86400;
const GRACE_DEFAULT = 300;
const MODELS_MAX = 20;
const MODEL_NAME_MAX = 100;

export interface CreateMonitorInput {
  name?: unknown;
  grace_seconds?: unknown;
  slow_tps_threshold?: unknown;
  min_gpu_pct?: unknown;
  webhook_url?: unknown;
  public?: unknown;
}

export interface ValidatedMonitorFields {
  name: string;
  grace_seconds: number;
  slow_tps_threshold: number | null;
  min_gpu_pct: number | null;
  webhook_url: string | null;
  public: boolean;
}

function validateName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError("name must be a non-empty string");
  }
  if (value.length > NAME_MAX) {
    throw new ValidationError(`name must be at most ${NAME_MAX} characters`);
  }
  return value.trim();
}

function validateGraceSeconds(value: unknown): number {
  const g = Number(value);
  if (!Number.isFinite(g) || !Number.isInteger(g) || g < GRACE_MIN || g > GRACE_MAX) {
    throw new ValidationError(
      `grace_seconds must be an integer between ${GRACE_MIN} and ${GRACE_MAX}`,
    );
  }
  return g;
}

function validateSlowTpsThreshold(value: unknown): number | null {
  if (value === null) return null;
  const t = Number(value);
  if (!Number.isFinite(t) || t <= 0) {
    throw new ValidationError("slow_tps_threshold must be a positive number");
  }
  return t;
}

function validateMinGpuPct(value: unknown): number | null {
  if (value === null) return null;
  const p = Number(value);
  if (!Number.isFinite(p) || p <= 0 || p > 100) {
    throw new ValidationError("min_gpu_pct must be a number above 0 and at most 100");
  }
  return p;
}

function validateWebhookUrl(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ValidationError("webhook_url must be a string");
  }
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new ValidationError("webhook_url must be a valid URL");
  }
  if (u.protocol !== "https:") {
    throw new ValidationError("webhook_url must use https://");
  }
  if (u.hostname === "ntfy.sh") {
    // ntfy.sh refuses connections from Cloudflare Workers (HTTP 522), so alerts would never arrive.
    throw new ValidationError("ntfy.sh can't be reached from Paw Pulse's host; use Telegram, Discord, Slack, Teams or Google Chat instead");
  }
  return u.toString();
}

function validatePublic(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new ValidationError("public must be a boolean");
  }
  return value;
}

/** Validate a full monitor-creation payload, applying defaults. */
export function validateCreateMonitor(input: CreateMonitorInput): ValidatedMonitorFields {
  if (input === null || typeof input !== "object") {
    throw new ValidationError("request body must be a JSON object");
  }

  const name = input.name === undefined ? "unnamed monitor" : validateName(input.name);
  const grace_seconds =
    input.grace_seconds === undefined ? GRACE_DEFAULT : validateGraceSeconds(input.grace_seconds);
  const slow_tps_threshold =
    input.slow_tps_threshold === undefined ? null : validateSlowTpsThreshold(input.slow_tps_threshold);
  const webhook_url =
    input.webhook_url === undefined ? null : validateWebhookUrl(input.webhook_url);
  const isPublic = input.public === undefined ? false : validatePublic(input.public);

  const min_gpu_pct = input.min_gpu_pct === undefined ? null : validateMinGpuPct(input.min_gpu_pct);
  return { name, grace_seconds, slow_tps_threshold, min_gpu_pct, webhook_url, public: isPublic };
}

export interface PatchMonitorInput {
  name?: unknown;
  grace_seconds?: unknown;
  slow_tps_threshold?: unknown;
  min_gpu_pct?: unknown;
  webhook_url?: unknown;
  public?: unknown;
}

/** Validate a partial PATCH payload: only provided fields are checked/returned. */
export function validatePatchMonitor(
  input: PatchMonitorInput,
): Partial<ValidatedMonitorFields> {
  if (input === null || typeof input !== "object") {
    throw new ValidationError("request body must be a JSON object");
  }

  const out: Partial<ValidatedMonitorFields> = {};
  if (input.name !== undefined) out.name = validateName(input.name);
  if (input.grace_seconds !== undefined) out.grace_seconds = validateGraceSeconds(input.grace_seconds);
  if (input.slow_tps_threshold !== undefined) {
    out.slow_tps_threshold = validateSlowTpsThreshold(input.slow_tps_threshold);
  }
  if (input.min_gpu_pct !== undefined) out.min_gpu_pct = validateMinGpuPct(input.min_gpu_pct);
  if (input.webhook_url !== undefined) out.webhook_url = validateWebhookUrl(input.webhook_url);
  if (input.public !== undefined) out.public = validatePublic(input.public);

  if (Object.keys(out).length === 0) {
    throw new ValidationError("no recognized fields to update");
  }

  return out;
}

export interface BeatInput {
  ok?: unknown;
  models?: unknown;
  tokens_per_sec?: unknown;
  latency_ms?: unknown;
  gpu_offload_pct?: unknown;
  note?: unknown;
}

export interface ValidatedBeat {
  ok: boolean;
  models: string[] | null;
  tokens_per_sec: number | null;
  latency_ms: number | null;
  gpu_offload_pct: number | null;
  note: string | null;
}

export function validateBeat(input: BeatInput): ValidatedBeat {
  if (input === null || typeof input !== "object") {
    throw new ValidationError("request body must be a JSON object");
  }
  if (typeof input.ok !== "boolean") {
    throw new ValidationError("ok must be a boolean");
  }

  let models: string[] | null = null;
  if (input.models !== undefined && input.models !== null) {
    if (!Array.isArray(input.models) || !input.models.every((m) => typeof m === "string")) {
      throw new ValidationError("models must be an array of strings");
    }
    if (input.models.length > MODELS_MAX) {
      throw new ValidationError(`models must contain at most ${MODELS_MAX} entries`);
    }
    models = input.models.map((m) => m.slice(0, MODEL_NAME_MAX));
  }

  let tokens_per_sec: number | null = null;
  if (input.tokens_per_sec !== undefined && input.tokens_per_sec !== null) {
    const t = Number(input.tokens_per_sec);
    if (!Number.isFinite(t) || t < 0) {
      throw new ValidationError("tokens_per_sec must be a non-negative number");
    }
    tokens_per_sec = t;
  }

  let latency_ms: number | null = null;
  if (input.latency_ms !== undefined && input.latency_ms !== null) {
    const l = Number(input.latency_ms);
    if (!Number.isFinite(l) || l < 0) {
      throw new ValidationError("latency_ms must be a non-negative number");
    }
    latency_ms = l;
  }

  let gpu_offload_pct: number | null = null;
  if (input.gpu_offload_pct !== undefined && input.gpu_offload_pct !== null) {
    const g = Number(input.gpu_offload_pct);
    if (!Number.isFinite(g) || g < 0 || g > 100) {
      throw new ValidationError("gpu_offload_pct must be a number from 0 to 100");
    }
    gpu_offload_pct = g;
  }

  let note: string | null = null;
  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== "string") {
      throw new ValidationError("note must be a string");
    }
    if (input.note.length > NOTE_MAX) {
      throw new ValidationError(`note must be at most ${NOTE_MAX} characters`);
    }
    note = input.note;
  }

  return { ok: input.ok, models, tokens_per_sec, latency_ms, gpu_offload_pct, note };
}
