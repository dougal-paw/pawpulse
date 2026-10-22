// Static OpenAPI 3.1 document. Kept as a plain object (not generated from
// zod/etc.) to stay dependency-free; validation.ts is the actual source of
// truth for request shapes and this is kept in sync by hand.

export function openApiSpec(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Paw Pulse",
      version: "0.1.0",
      summary: "Push-based heartbeat and performance monitor for self-hosted LLM servers.",
      description:
        "Paw Pulse is designed, built, deployed, and operated by Pup, an AI agent, as part of the " +
        "Dougal Paw project. No accounts, no IP storage, no personal data. Monitors are anonymous: " +
        "identified only by a random id plus an ingest token and a manage token.",
    },
    servers: [{ url: origin }],
    paths: {
      "/v1/monitors": {
        post: {
          summary: "Create a monitor",
          operationId: "createMonitor",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string", maxLength: 100 },
                    grace_seconds: { type: "integer", minimum: 60, maximum: 86400, default: 300 },
                    slow_tps_threshold: { type: "number", nullable: true },
                    min_gpu_pct: { type: "number", exclusiveMinimum: 0, maximum: 100, nullable: true, description: "Mark the monitor slow when a beat reports gpu_offload_pct below this (e.g. Ollama fell back to CPU)." },
                    webhook_url: { type: "string", format: "uri", nullable: true, description: "https:// only. Native formats for Discord, Slack, Microsoft Teams (incoming webhook or Workflows), Telegram (https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>) and Google Chat; anything else gets generic JSON {content, text, monitor_name, alert, state, timestamp}." },
                    public: { type: "boolean", default: false },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Monitor created. ingest_token and manage_token are shown only this once.",
              content: { "application/json": { schema: { type: "object" } } },
            },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/v1/monitors/{id}/beat": {
        post: {
          summary: "Send a heartbeat",
          operationId: "sendBeat",
          security: [{ ingestToken: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ok"],
                  properties: {
                    ok: { type: "boolean" },
                    models: { type: "array", items: { type: "string" }, maxItems: 20 },
                    tokens_per_sec: { type: "number", minimum: 0, nullable: true },
                    latency_ms: { type: "number", minimum: 0, nullable: true },
                    gpu_offload_pct: { type: "number", minimum: 0, maximum: 100, nullable: true, description: "Share of loaded model weights in VRAM (Ollama /api/ps size_vram/size); lowest across loaded models." },
                    note: { type: "string", maxLength: 200, nullable: true },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Beat recorded" }, "401": { description: "Invalid ingest token" } },
        },
      },
      "/v1/monitors/{id}/status": {
        get: {
          summary: "Get monitor status",
          operationId: "getStatus",
          security: [{ manageToken: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Status (public monitors need no auth)" },
            "401": { description: "Private monitor; manage token required" },
            "404": { description: "Not found" },
          },
        },
        patch: {
          summary: "Update monitor settings",
          operationId: "patchMonitor",
          security: [{ manageToken: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Updated" }, "401": { description: "Invalid manage token" } },
        },
        delete: {
          summary: "Delete a monitor and all its data",
          operationId: "deleteMonitor",
          security: [{ manageToken: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Deleted" }, "401": { description: "Invalid manage token" } },
        },
      },
      "/v1/monitors/{id}/heartbeats": {
        get: {
          summary: "List recent heartbeats",
          operationId: "listHeartbeats",
          security: [{ manageToken: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 50, maximum: 500 } },
          ],
          responses: { "200": { description: "List of heartbeats, newest first" } },
        },
      },
      "/s/{id}": {
        get: { summary: "Public HTML status page", operationId: "statusPage", responses: { "200": { description: "HTML" } } },
      },
      "/badge/{id}.svg": {
        get: { summary: "Shields-style status badge", operationId: "badge", responses: { "200": { description: "SVG" } } },
      },
      "/pawpulse.sh": {
        get: { summary: "POSIX sh heartbeat client", operationId: "clientScript", responses: { "200": { description: "Shell script" } } },
      },
    },
    components: {
      securitySchemes: {
        ingestToken: { type: "http", scheme: "bearer", description: "Monitor's ingest_token" },
        manageToken: { type: "http", scheme: "bearer", description: "Monitor's manage_token" },
      },
    },
  };
}
