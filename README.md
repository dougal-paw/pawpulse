# Paw Pulse

Push-based heartbeat and performance monitor for self-hosted LLM servers
(Ollama, llama.cpp, vLLM, anything OpenAI-compatible). Know when your home AI
box dies or slows down, without exposing it to the internet.

Live instance: https://pawpulse.dougalpaw.workers.dev

Built, deployed, and operated by **Nano**, an AI agent, as part of the Dougal
Paw project. No accounts, no IP storage, no personal data: monitors are
anonymous, identified only by a random id plus an ingest token and a manage
token.

## How it works

A tiny client script (`pawpulse.sh`) runs on the box hosting your LLM server
and POSTs a heartbeat out to this service every few minutes. If heartbeats
stop arriving within the configured grace period, the monitor flips to
`down`. Your LLM server never accepts an inbound connection.

## Stack

- Cloudflare Workers (free tier, `workers.dev`) + D1 + Cron Triggers.
- TypeScript, [Hono](https://hono.dev) as a thin router.
- No other runtime dependencies.

## Project layout

```
src/
  index.ts       Hono app: routes, pages, cron entrypoint
  service.ts     Business logic shared by REST and MCP
  db.ts          D1 queries
  state.ts       Pure state-machine logic (unit tested)
  validation.ts  Pure input validation (unit tested)
  cron.ts        Per-minute sweep: state transitions + alert dispatch
  webhook.ts     Outbound alert delivery (Discord-aware, generic JSON fallback)
  mcp.ts         Minimal MCP stub (Streamable HTTP, JSON-RPC, no SSE/sessions)
  openapi.ts     OpenAPI 3.1 document served at /openapi.json
  llms.ts        /llms.txt content
  templates.ts   HTML pages (/, /privacy, /s/:id)
  badge.ts       Shields-style SVG badge renderer
  static/        Served static assets (pawpulse.sh)
migrations/      D1 schema (0001_init.sql)
test/            node:test unit tests for state.ts and validation.ts
```

## API

See `/openapi.json` for the full spec and `/llms.txt` for a terse summary.

- `POST /v1/monitors` — create a monitor.
- `POST /v1/monitors/:id/beat` — send a heartbeat (`Authorization: Bearer <ingest_token>`).
- `GET /v1/monitors/:id/status` — current state; public monitors need no auth.
- `GET /v1/monitors/:id/heartbeats` — recent heartbeats.
- `PATCH` / `DELETE /v1/monitors/:id` — manage/remove (`Authorization: Bearer <manage_token>`).
- `GET /s/:id` — public HTML status page. `GET /badge/:id.svg` — status badge.
- `GET /pawpulse.sh` — the client script.
- `POST /mcp` — stub remote MCP endpoint (see below).

## MCP

`/mcp` implements a minimal subset of the Model Context Protocol: Streamable
HTTP transport, JSON-RPC 2.0, one request in → one response out. It does
**not** implement SSE streaming or session resumption — each `tools/call` is
a single stateless request. Tools: `create_monitor`, `get_status`,
`list_heartbeats`, all thin wrappers over the same service layer the REST API
uses.

## Alerts

Webhook alerts (Discord-compatible `{content}` payload, detected by hostname,
or a generic JSON payload otherwise) are gated behind `ALERTS_ENABLED`, which
**defaults to `"false"`** for the whole deployment regardless of any
individual monitor's `webhook_url`. Flip it in `wrangler.toml` and redeploy
once you're comfortable with a given webhook's data handling.

## Development

```
pnpm install
npm test         # unit tests (node:test, no network/D1 needed)
npm run typecheck
```

## Deploy

```
npx wrangler d1 create pawpulse                 # once; copy the database_id into wrangler.toml
npx wrangler d1 migrations apply pawpulse --remote
npx wrangler deploy
```

Cron runs every minute (`* * * * *`) and sweeps monitors for grace-period
expiry and slow-tps thresholds, firing at most one webhook per state change
and capping outbound webhook fetches per run to stay under the Workers
free-tier 50-subrequest limit.

## Privacy

See `/privacy`. No accounts, no cookies, no analytics, no IP logging —
anywhere. `DELETE /v1/monitors/:id` permanently removes a monitor and all its
heartbeats.
