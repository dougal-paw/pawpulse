# Paw Pulse: MVP spec (v0.1)
A push-based heartbeat and performance monitor for self-hosted LLM servers (Ollama, llama.cpp, vLLM, anything OpenAI-compatible).
Pitch: "Know when your home AI box dies or slows down, without exposing it to the internet."

## Hard constraints
- Cloudflare free tier only: Workers + D1 (+ KV if needed) + Cron Triggers. Workers on workers.dev.
- NO personal data: no accounts, no emails, no analytics, no cookies, no IP logging/storage. Monitors are anonymous, identified by random IDs and secret tokens.
- Agent-friendly: JSON REST API, OpenAPI 3.1 spec at /openapi.json, /llms.txt, and a remote MCP endpoint (Streamable HTTP at /mcp, JSON-RPC: tools create_monitor, get_status, list_heartbeats) if feasible in the MVP; otherwise stub it and note it.
- Honest copy: say it's built and run by an AI agent (Pup) as part of Dougal Paw. Never name Chris or any company.

## Model
- POST /v1/monitors {name, grace_seconds (60..86400, default 300), slow_tps_threshold?, webhook_url?} -> {id, ingest_token, manage_token, status_url, badge_url}. Rate-limit creation crudely (e.g. by a per-minute global counter in KV/D1). Don't store IPs.
- POST /v1/monitors/:id/beat (Authorization: Bearer ingest_token) body {ok: bool, models?: [string], tokens_per_sec?: number, latency_ms?: number, note?: string(<=200)}. Store the last N=500 beats per monitor (prune the old ones).
- GET /v1/monitors/:id/status -> {state: up|down|slow|new, last_beat_at, last_tps, uptime_24h, ...}. Public if the monitor is marked public, otherwise needs the manage token.
- GET /s/:id: minimal HTML status page (public monitors only). GET /badge/:id.svg: shields-style badge.
- PATCH/DELETE /v1/monitors/:id with manage_token. DELETE removes all data.
- Cron every minute: find monitors past their grace period (state change up->down) or slow, and fire webhook alerts ONCE per state change (Discord-compatible JSON {content}, plus a generic JSON payload, auto-detected by URL). Also a recovery alert. Respect the 50-subrequest limit (batch, cap per run).
- Webhook alerts are behind a feature flag ALERTS_ENABLED (env var), default "false" until the data-protection question is settled.

## Client
- `pawpulse.sh`: a POSIX sh script (curl + jq optional) for cron/systemd timers. It probes local Ollama (/api/tags for models, /api/ps; optional tiny generate to measure tokens/sec, OFF by default) or an OpenAI-compatible /v1/models, then POSTs a beat. Serve it at /pawpulse.sh. Docs give a one-line cron example.

## Pages
- `/`: landing page. Clear, bold, honest; explains the push model and why exposing Ollama is risky; quick start in 3 steps; agent/API section; "built by an AI agent" note; links to /docs, /openapi.json, /llms.txt, /privacy. Small and fast, no external assets, light and dark mode.
- `/privacy`: what's stored (monitor names, beats, optional webhook URL), no accounts or IPs, deletion via DELETE.
- Pricing: say "free during beta", nothing more.

## Quality
- TypeScript Worker, no framework or a tiny one (Hono is fine). Unit tests for the core logic (state machine, validation) with node's test runner or vitest, kept light: the machine has 768 MiB RAM.
- README with setup and deploy steps.
