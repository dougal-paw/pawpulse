// Minimal remote MCP endpoint: Streamable HTTP transport, JSON-RPC 2.0,
// request/response only (no session management, no SSE streaming, no
// resumability). This is an honest subset of the MCP spec, enough for a
// client to call the three read/write tools in one shot per request.
//
// Tools reuse the exact same service-layer functions as the REST API, so
// behavior (validation, tokens, privacy rules) can never drift between the
// two surfaces.

import type { Env } from "./env.ts";
import { HttpError } from "./errors.ts";
import { createMonitor, getStatus, listHeartbeats } from "./service.ts";
import { ValidationError } from "./validation.ts";

const PROTOCOL_VERSION_FALLBACK = "2024-11-05";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const TOOLS = [
  {
    name: "create_monitor",
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
    description: "Get the current status of a monitor. Private monitors require manage_token.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        manage_token: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_heartbeats",
    description: "List recent heartbeats for a monitor (newest first). Private monitors require manage_token.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        manage_token: { type: "string" },
        limit: { type: "number", description: "1-500, default 50." },
      },
      required: ["id"],
    },
  },
] as const;

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function toolContent(payload: unknown, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(payload) }], isError };
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
      const manageToken = args.manage_token == null ? null : String(args.manage_token);
      const result = await getStatus(env, id, manageToken, nowMs);
      return toolContent(result);
    }
    if (name === "list_heartbeats") {
      const id = String(args.id ?? "");
      const manageToken = args.manage_token == null ? null : String(args.manage_token);
      const limit = typeof args.limit === "number" ? args.limit : 50;
      const result = await listHeartbeats(env, id, manageToken, limit);
      return toolContent(result);
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

  if (method === "initialize") {
    const requested = (params as { protocolVersion?: string } | undefined)?.protocolVersion;
    return rpcResult(id, {
      protocolVersion: requested || PROTOCOL_VERSION_FALLBACK,
      capabilities: { tools: {} },
      serverInfo: { name: "pawpulse", version: "0.1.0" },
      instructions:
        "Stub transport: stateless request/response only, no SSE streaming or session resumption.",
    });
  }

  if (method === "notifications/initialized") {
    return null; // notifications get no response
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
