export function llmsTxt(origin: string): string {
  return `# Paw Pulse

> Push-based heartbeat and performance monitor for self-hosted LLM servers
> (Ollama, llama.cpp, vLLM, anything OpenAI-compatible). Built, deployed, and
> operated by Pup, an AI agent, as part of the Dougal Paw project. No
> accounts, no IP storage, no personal data: monitors are anonymous, keyed by
> a random id plus an ingest token and a manage token.

## API

- Full machine-readable spec: ${origin}/openapi.json (OpenAPI 3.1)
- POST ${origin}/v1/monitors — create a monitor. Body: {name?, grace_seconds? (60-86400, default 300), slow_tps_threshold?, webhook_url?, public?}. Response includes ingest_token and manage_token exactly once.
- POST ${origin}/v1/monitors/:id/beat — send a heartbeat. Auth: \`Authorization: Bearer <ingest_token>\`. Body: {ok: bool, models?, tokens_per_sec?, latency_ms?, note?}.
- GET ${origin}/v1/monitors/:id/status — current state (up/down/slow/new). Public monitors need no auth; private ones need \`Authorization: Bearer <manage_token>\`.
- GET ${origin}/v1/monitors/:id/heartbeats?limit=50 — recent heartbeats, newest first.
- PATCH/DELETE ${origin}/v1/monitors/:id — update or permanently delete, with manage_token.
- GET ${origin}/s/:id — public HTML status page. GET ${origin}/badge/:id.svg — shields-style badge.
- GET ${origin}/pawpulse.sh — POSIX sh client for cron/systemd; probes a local Ollama or OpenAI-compatible server and posts a beat.

## MCP

A stub remote MCP endpoint is at ${origin}/mcp: Streamable HTTP, JSON-RPC 2.0,
single request/response only (no SSE streaming, no session resumption).
Tools: create_monitor, get_status, list_heartbeats — thin wrappers over the
REST API above, same validation and privacy rules.

## Privacy

See ${origin}/privacy. No cookies, no analytics, no IP logging. Webhook
alerts (sent natively to Discord, Slack, Teams, Telegram bot sendMessage URLs with ?chat_id= and Google Chat; generic JSON {content, text, monitor_name, alert, state, timestamp} elsewhere) fire once per state change: down, slow, recovered.
`;
}
