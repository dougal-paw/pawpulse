// Outbound webhook alert delivery. Fires only when ALERTS_ENABLED="true" and
// a monitor has a webhook_url configured. No personal data is ever included —
// just the monitor name (chosen by the operator), state, and a timestamp.

import type { AlertKind } from "./state.ts";
import type { MonitorState } from "./state.ts";

export interface AlertDetail {
  lastOk: boolean | null;
  lastTps: number | null;
  slowTpsThreshold: number | null;
  lastGpuPct?: number | null;
  minGpuPct?: number | null;
  graceSeconds: number;
}

/** Strip markdown characters so a monitor name can't restyle the message. */
function plainName(name: string): string {
  return name.replace(/[*_~`|>\\]/g, "");
}

/** Bold markup per destination: Discord/Teams use **x**, Slack/Google Chat *x*, plain targets none. */
export type Markup = "md" | "slack" | "plain";

export function alertMessage(
  name: string,
  alert: AlertKind,
  state: MonitorState,
  d: AlertDetail,
  markup: Markup = "md",
): string {
  const bold = markup === "md" ? "**" : markup === "slack" ? "*" : "";
  const n = `${bold}${plainName(name)}${bold}`;
  const tps = d.lastTps !== null ? ` · ${d.lastTps} tok/s` : "";
  if (alert === "recovery") return `🟢 ${n} recovered (now ${state}${tps}).`;
  if (alert === "down") {
    return d.lastOk === false
      ? `🔴 ${n} is DOWN: the box checked in, but its LLM server isn't answering.`
      : `🔴 ${n} is DOWN: no heartbeat for over ${d.graceSeconds}s.`;
  }
  if (d.minGpuPct != null && d.lastGpuPct != null && d.lastGpuPct < d.minGpuPct) {
    return `🟠 ${n} is SLOW: only ${Math.round(d.lastGpuPct)}% of the model is on the GPU (your floor is ${d.minGpuPct}%). It has probably fallen back to CPU.`;
  }
  const limit = d.slowTpsThreshold !== null ? ` (your threshold is ${d.slowTpsThreshold})` : "";
  return `🟠 ${n} is SLOW: ${d.lastTps ?? "?"} tok/s${limit}.`;
}

export type Target = "discord" | "slack" | "teams" | "telegram" | "gchat" | "generic";

export function targetFor(url: string): Target {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "generic";
  }
  const h = u.hostname;
  if (h === "discord.com" || h === "discordapp.com" || h.endsWith(".discord.com")) return "discord";
  if (h === "hooks.slack.com") return "slack";
  if (h.endsWith(".webhook.office.com") || h.endsWith(".logic.azure.com") || h.endsWith(".powerplatform.com")) return "teams";
  if (h === "api.telegram.org" && /^\/bot[^/]+\/sendMessage$/.test(u.pathname)) return "telegram";
  if (h === "chat.googleapis.com") return "gchat";
  return "generic";
}

export interface OutboundRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** Shape the alert for the destination's native webhook format. */
export function buildRequest(
  webhookUrl: string,
  monitorName: string,
  alert: AlertKind,
  state: MonitorState,
  detail: AlertDetail,
  nowMs: number,
): OutboundRequest {
  const json = { "content-type": "application/json" };
  const msg = (m: Markup) => alertMessage(monitorName, alert, state, detail, m);
  switch (targetFor(webhookUrl)) {
    case "discord":
      return { url: webhookUrl, headers: json, body: JSON.stringify({ content: msg("md"), username: "Paw Pulse" }) };
    case "slack":
    case "gchat":
      return { url: webhookUrl, headers: json, body: JSON.stringify({ text: msg("slack") }) };
    case "teams":
      return {
        url: webhookUrl,
        headers: json,
        body: JSON.stringify({
          type: "message",
          attachments: [
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              content: {
                $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                type: "AdaptiveCard",
                version: "1.4",
                body: [{ type: "TextBlock", text: msg("md"), wrap: true }],
              },
            },
          ],
        }),
      };
    case "telegram": {
      // https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>
      const u = new URL(webhookUrl);
      const chatId = u.searchParams.get("chat_id");
      u.search = "";
      return { url: u.toString(), headers: json, body: JSON.stringify({ chat_id: chatId, text: msg("plain") }) };
    }
    default:
      return {
        url: webhookUrl,
        headers: json,
        body: JSON.stringify({
          content: msg("plain"),
          text: msg("plain"),
          monitor_name: monitorName,
          alert,
          state,
          timestamp: new Date(nowMs).toISOString(),
        }),
      };
  }
}

/** Best-effort webhook delivery. Never throws — a failed alert must not break the cron sweep. */
export async function sendWebhookAlert(
  webhookUrl: string,
  monitorName: string,
  alert: AlertKind,
  state: MonitorState,
  detail: AlertDetail,
  nowMs: number,
): Promise<void> {
  const req = buildRequest(webhookUrl, monitorName, alert, state, detail, nowMs);
  try {
    const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
    // Target type and status only; never log the URL (it can contain secrets).
    if (!res.ok) console.log(`alert delivery failed: ${targetFor(webhookUrl)} ${res.status}`);
  } catch (e) {
    console.log(`alert delivery error: ${targetFor(webhookUrl)} ${(e as Error).name}`);
    // Swallow delivery errors; the next degraded/recovery transition will try again.
  }
}
