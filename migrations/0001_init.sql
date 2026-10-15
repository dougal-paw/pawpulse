-- Paw Pulse initial schema. No personal data: monitors are anonymous,
-- identified only by random ids and secret tokens. No IPs are stored anywhere.

CREATE TABLE monitors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ingest_token TEXT NOT NULL,
  manage_token TEXT NOT NULL,
  grace_seconds INTEGER NOT NULL,
  slow_tps_threshold REAL,
  webhook_url TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_beat_at INTEGER,
  last_ok INTEGER,
  last_tps REAL,
  last_latency_ms REAL,
  last_models TEXT,
  last_note TEXT,
  state TEXT NOT NULL DEFAULT 'new',
  last_state_change_at INTEGER,
  alerted_state TEXT
);

CREATE TABLE beats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  models TEXT,
  tokens_per_sec REAL,
  latency_ms REAL,
  note TEXT
);

CREATE INDEX idx_beats_monitor ON beats(monitor_id, created_at DESC);

-- Crude global rate limiter for monitor creation: one row per minute bucket.
CREATE TABLE rate_limits (
  bucket INTEGER PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);
