// Remote MCP server over Streamable HTTP. Stateless: every POST carries one
// JSON-RPC message and gets a plain JSON response (the spec lets servers
// answer with application/json instead of SSE, and makes sessions optional).
// GET /mcp returns 405 because this server never pushes server-initiated
// messages.
//
// Tools reuse the exact same service-layer functions as the REST API, so
// behavior (validation, tokens, privacy rules) can never drift between the
// two surfaces.

import type { Env } from "./env.ts";
import { HttpError } from "./errors.ts";
import { createMonitor, deleteMonitor, getStatus, listHeartbeats, patchMonitor } from "./service.ts";
import { ValidationError } from "./validation.ts";

// Newest first. We answer with the client's version if we support it,
// otherwise our newest, and the client decides whether to continue.
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_VERSION = "0.2.0";

const idProp = { type: "string", description: "Monitor id, as returned by create_monitor." };
const tokenProp = { type: "string", description: "The monitor's manage_token (returned once by create_monitor)." };

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const TOOLS = [
  {
    name: "create_monitor",
    title: "Create monitor",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description:
      "Create a new anonymous Paw Pulse monitor. Returns ingest_token and manage_token exactly once — store them, they cannot be recovered.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Display name, not treated as identifying." },
        grace_seconds: { type: "number", description: "60-86400, default 300." },
        slow_tps_threshold: { type: "number", description: "Optional tokens/sec floor." },
        webhook_url: { type: "string", description: "Optional https:// webhook for alerts." },
        public: { type: "boolean", description: "Whether /v1/monitors/:id/status and /s/:id are public." },
      },
    },
  },
  {
    name: "get_status",
    title: "Get monitor status",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: "Get the current status of a monitor. Private monitors require manage_token.",
    inputSchema: {
      type: "object",
      properties: {
        id: idProp,
        manage_token: tokenProp,
      },
      required: ["id"],
    },
  },
  {
    name: "list_heartbeats",
    title: "List recent heartbeats",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: "List recent heartbeats for a monitor (newest first). Private monitors require manage_token.",
    inputSchema: {
      type: "object",
      properties: {
        id: idProp,
        manage_token: tokenProp,
        limit: { type: "number", description: "1-500, default 50." },
      },
      required: ["id"],
    },
  },
  {
    name: "update_monitor",
    title: "Update monitor settings",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: "Change a monitor's name, grace period, slow threshold, webhook or visibility. Only the fields you pass change.",
    inputSchema: {
      type: "object",
      properties: {
        id: idProp,
        manage_token: tokenProp,
        name: { type: "string", description: "New display name." },
        grace_seconds: { type: "number", description: "60-86400." },
        slow_tps_threshold: { type: ["number", "null"], description: "Tokens/sec floor, or null to clear." },
        webhook_url: { type: ["string", "null"], description: "https:// webhook, or null to clear." },
        public: { type: "boolean" },
      },
      required: ["id", "manage_token"],
    },
  },
  {
    name: "delete_monitor",
    title: "Delete monitor",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    description: "Permanently delete a monitor and all its heartbeats. Cannot be undone.",
    inputSchema: {
      type: "object",
      properties: { id: idProp, manage_token: tokenProp },
      required: ["id", "manage_token"],
    },
  },
  {
    name: "setup_instructions",
    title: "Get setup instructions",
    annotations: { readOnlyHint: true, openWorldHint: false },
    description:
      "Shell commands to install the heartbeat script on the box being monitored and run it from cron. Pass the id and ingest_token from create_monitor.",
    inputSchema: {
      type: "object",
      properties: {
        id: idProp,
        ingest_token: { type: "string", description: "The monitor's ingest_token (returned once by create_monitor)." },
        llm_kind: { type: "string", enum: ["ollama", "openai", "none"], description: "none = plain heartbeat, no LLM probe. Default ollama." },
      },
      required: ["id", "ingest_token"],
    },
  },
];

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function toolContent(payload: unknown, isError = false) {
  const out: Record<string, unknown> = { content: [{ type: "text", text: JSON.stringify(payload) }], isError };
  if (!isError && payload && typeof payload === "object" && !Array.isArray(payload)) out.structuredContent = payload;
  return out;
}

const tokenArg = (v: unknown) => (v == null ? null : String(v));

function setupInstructions(origin: string, args: Record<string, unknown>) {
  const id = String(args.id ?? "");
  const token = String(args.ingest_token ?? "");
  const kind = args.llm_kind === "openai" || args.llm_kind === "none" ? args.llm_kind : "ollama";
  if (!/^[A-Za-z0-9_-]+$/.test(id) || !/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new ValidationError("id and ingest_token must be the values returned by create_monitor");
  }
  const env = `PAWPULSE_URL=${origin} PAWPULSE_ID=${id} PAWPULSE_TOKEN=${token}${kind === "ollama" ? "" : ` LLM_KIND=${kind}`}`;
  return {
    install: `curl -o /usr/local/bin/pawpulse.sh ${origin}/pawpulse.sh && chmod +x /usr/local/bin/pawpulse.sh`,
    test_once: `${env} PAWPULSE_VERBOSE=1 /usr/local/bin/pawpulse.sh`,
    crontab_line: `*/5 * * * * ${env} /usr/local/bin/pawpulse.sh`,
    note: "Run these on the box being monitored. The ingest token only allows posting heartbeats.",
  };
}

async function callTool(env: Env, origin: string, name: string, args: Record<string, unknown>) {
  const nowMs = Date.now();
  try {
    if (name === "create_monitor") {
      const result = await createMonitor(env, origin, args, nowMs);
      return toolContent(result);
    }
    if (name === "get_status") {
      const id = String(args.id ?? "");
      const result = await getStatus(env, id, tokenArg(args.manage_token), nowMs);
      return toolContent(result);
    }
    if (name === "list_heartbeats") {
      const id = String(args.id ?? "");
      const limit = typeof args.limit === "number" ? args.limit : 50;
      const result = await listHeartbeats(env, id, tokenArg(args.manage_token), limit);
      return toolContent(result);
    }
    if (name === "update_monitor") {
      const { id, manage_token, ...fields } = args;
      await patchMonitor(env, String(id ?? ""), tokenArg(manage_token), fields as never);
      return toolContent(await getStatus(env, String(id), tokenArg(manage_token), nowMs));
    }
    if (name === "delete_monitor") {
      await deleteMonitor(env, String(args.id ?? ""), tokenArg(args.manage_token));
      return toolContent({ ok: true, deleted: String(args.id) });
    }
    if (name === "setup_instructions") {
      return toolContent(setupInstructions(origin, args));
    }
    return toolContent({ error: `unknown tool: ${name}` }, true);
  } catch (e) {
    if (e instanceof HttpError) return toolContent({ error: e.message, status: e.status }, true);
    if (e instanceof ValidationError) return toolContent({ error: e.message }, true);
    return toolContent({ error: "internal error" }, true);
  }
}

/** Handle one JSON-RPC request/notification over the Streamable HTTP POST path. */
export async function handleMcpRequest(
  env: Env,
  origin: string,
  body: JsonRpcRequest,
): Promise<{ jsonrpc: string; id: unknown; result?: unknown; error?: unknown } | null> {
  const { id, method, params } = body;

  // Notifications (no id) never get a response.
  if (id === undefined || (typeof method === "string" && method.startsWith("notifications/"))) return null;

  if (method === "initialize") {
    const requested = (params as { protocolVersion?: string } | undefined)?.protocolVersion;
    const version =
      requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
    return rpcResult(id, {
      protocolVersion: version,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "pawpulse", title: "Paw Pulse", version: SERVER_VERSION },
      instructions:
        "Paw Pulse monitors self-hosted LLM boxes (and any box with LLM_KIND=none) with outbound heartbeats. " +
        "Typical flow: create_monitor -> setup_instructions -> run the commands on the box -> get_status. " +
        "Store manage_token safely; it cannot be recovered.",
    });
  }

  if (method === "ping") {
    return rpcResult(id, {});
  }

  if (method === "tools/list") {
    return rpcResult(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const name = String((params as { name?: string } | undefined)?.name ?? "");
    const args = ((params as { arguments?: Record<string, unknown> } | undefined)?.arguments ?? {}) as Record<
      string,
      unknown
    >;
    const result = await callTool(env, origin, name, args);
    return rpcResult(id, result);
  }

  return rpcError(id, -32601, `method not found: ${method}`);
}
