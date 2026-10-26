import { ICON_SVG } from "./static/icon-svg.ts";
import { Hono } from "hono";
import type { Env } from "./env.ts";
import { HttpError } from "./errors.ts";
import { ValidationError } from "./validation.ts";
import {
  createMonitor,
  recordBeat,
  getStatus,
  listHeartbeats,
  patchMonitor,
  deleteMonitor,
  getPublicMonitorForPage,
  getBadgeState,
} from "./service.ts";
import { DEMO_SVG } from "./static/demo-svg.ts";
import { renderBadge, renderCustomBadge } from "./badge.ts";
import { landingPage, privacyPage, statusPage, notFoundPage, ollamaGuidePage, cpuFallbackGuidePage, openaiServerGuidePage } from "./templates.ts";
import { PAWPULSE_SH } from "./static/pawpulse-sh.ts";
import { openApiSpec } from "./openapi.ts";
import { llmsTxt } from "./llms.ts";
import { handleMcpRequest, SUPPORTED_PROTOCOL_VERSIONS } from "./mcp.ts";
import { runCronSweep } from "./cron.ts";

const app = new Hono<{ Bindings: Env }>();

function bearerToken(c: { req: { header: (k: string) => string | undefined; query: (k: string) => string | undefined } }): string | null {
  const auth = c.req.header("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const q = c.req.query("token");
  return q ?? null;
}

function origin(url: string): string {
  return new URL(url).origin;
}

/** The public origin: CANONICAL_ORIGIN if configured, else wherever the request came in. */
function publicOrigin(c: { env: Env; req: { url: string } }): string {
  return (c.env.CANONICAL_ORIGIN || origin(c.req.url)).replace(/\/$/, "");
}

/** Fill the __ORIGIN__ / __PATH__ placeholders in pages and the client script. */
function fill(c: { env: Env; req: { url: string } }, text: string): string {
  return text.replaceAll("__ORIGIN__", publicOrigin(c)).replaceAll("__PATH__", new URL(c.req.url).pathname);
}

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400 | 401 | 404 | 429);
  if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

// ---- Pages --------------------------------------------------------------

app.get("/", (c) => c.html(fill(c, landingPage())));
app.get("/demo.svg", (c) => c.body(DEMO_SVG, 200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=3600" }));
app.get("/privacy", (c) => c.html(fill(c, privacyPage())));
app.get("/guides/monitor-ollama", (c) => c.html(fill(c, ollamaGuidePage())));
app.get("/guides/ollama-cpu-fallback", (c) => c.html(fill(c, cpuFallbackGuidePage())));
app.get("/guides/monitor-llama-cpp-vllm", (c) => c.html(fill(c, openaiServerGuidePage())));
// IndexNow (Bing, Yandex and others): the key is public by design; it proves we control this host.
const INDEXNOW_KEY = "fa9a7c866bb2c01f8344e6b52e2ef3ad";
app.get(`/${INDEXNOW_KEY}.txt`, (c) => c.text(INDEXNOW_KEY));
app.get("/robots.txt", (c) => c.text(`User-agent: *\nAllow: /\nSitemap: ${publicOrigin(c)}/sitemap.xml\n`));
app.get("/sitemap.xml", (c) => {
  const o = publicOrigin(c);
  const urls = ["/", "/guides/monitor-ollama", "/guides/ollama-cpu-fallback", "/guides/monitor-llama-cpp-vllm", "/privacy"].map((p) => `<url><loc>${o}${p}</loc></url>`).join("");
  return c.body(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, 200, { "content-type": "application/xml" });
});

app.get("/openapi.json", (c) => c.json(openApiSpec(publicOrigin(c))));
const svgHeaders = { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" };
app.get("/icon.svg", (c) => c.body(ICON_SVG, 200, svgHeaders));
app.get("/favicon.svg", (c) => c.body(ICON_SVG, 200, svgHeaders));
app.get("/favicon.ico", (c) => c.redirect("/favicon.svg", 301));
app.get("/llms.txt", (c) => c.text(llmsTxt(publicOrigin(c)), 200, { "content-type": "text/plain; charset=utf-8" }));
// Proves domain ownership to the official MCP Registry (public key only).
app.get("/.well-known/mcp-registry-auth", (c) => c.text("v=MCPv1; k=ed25519; p=SSZoTeQfEKO3gb/FIgvyhrc8rjDQ3ctJ/7p9cM9KXHo=", 200, { "content-type": "text/plain; charset=utf-8" }));
app.get("/pawpulse.sh", (c) => c.text(fill(c, PAWPULSE_SH), 200, { "content-type": "text/x-shellscript; charset=utf-8" }));

app.get("/s/:id", async (c) => {
  const status = await getPublicMonitorForPage(c.env, c.req.param("id"), Date.now());
  if (!status) return c.html(fill(c, notFoundPage()), 404);
  return c.html(fill(c, statusPage(status)));
});

app.get("/badge/:id", async (c) => {
  const idParam = c.req.param("id");
  if (!idParam.endsWith(".svg")) return c.notFound();
  const id = idParam.slice(0, -4);
  const state = await getBadgeState(c.env, id, Date.now());
  const svg = (() => {
    if (state === "not_found") return renderCustomBadge("not found", "#95a5a6");
    if (state === "private") return renderCustomBadge("private", "#95a5a6");
    return renderBadge(state);
  })();
  return c.body(svg, 200, { "content-type": "image/svg+xml", "cache-control": "no-cache" });
});

// ---- REST API -------------------------------------------------------------

app.post("/v1/monitors", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = await createMonitor(c.env, publicOrigin(c), body, Date.now());
  return c.json(result);
});

app.post("/v1/monitors/:id/beat", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = await recordBeat(c.env, c.req.param("id"), bearerToken(c), body, Date.now());
  return c.json(result);
});

app.get("/v1/monitors/:id/status", async (c) => {
  const result = await getStatus(c.env, c.req.param("id"), bearerToken(c), Date.now());
  return c.json(result);
});

app.get("/v1/monitors/:id/heartbeats", async (c) => {
  const limit = Number(c.req.query("limit")) || 50;
  const result = await listHeartbeats(c.env, c.req.param("id"), bearerToken(c), limit);
  return c.json(result);
});

app.patch("/v1/monitors/:id", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await patchMonitor(c.env, c.req.param("id"), bearerToken(c), body);
  return c.json({ ok: true });
});

app.delete("/v1/monitors/:id", async (c) => {
  await deleteMonitor(c.env, c.req.param("id"), bearerToken(c));
  return c.json({ ok: true });
});

// ---- MCP (Streamable HTTP, stateless JSON responses) ---------------------

app.post("/mcp", async (c) => {
  const pv = c.req.header("mcp-protocol-version");
  if (pv && !SUPPORTED_PROTOCOL_VERSIONS.includes(pv)) {
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `unsupported MCP-Protocol-Version: ${pv}` } }, 400);
  }
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error: expected one JSON-RPC message" } }, 400);
  }
  const response = await handleMcpRequest(c.env, publicOrigin(c), body);
  if (response === null) return c.body(null, 202); // notification or response: no content
  return c.json(response);
});

// No server-initiated messages, so no SSE stream to open.
app.get("/mcp", (c) => c.json({ error: "this server has no SSE stream; POST JSON-RPC messages to /mcp" }, 405, { allow: "POST" }));

app.notFound((c) => {
  if (c.req.path.startsWith("/v1/") || c.req.path.startsWith("/mcp")) {
    return c.json({ error: "not found" }, 404);
  }
  return c.html(fill(c, notFoundPage()), 404);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCronSweep(env, Date.now()).catch((err) => console.error("cron sweep failed", err)));
  },
};
