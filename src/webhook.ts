// Outbound webhook alert delivery. Fires only when ALERTS_ENABLED="true" and
// a monitor has a webhook_url configured. No personal data is ever included —
// just the monitor name (chosen by the operator), state, and a timestamp.

import type { AlertKind } from "./state.ts";
import type { MonitorState } from "./state.ts";

function isDiscordUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "discord.com" || h === "discordapp.com" || h.endsWith(".discord.com");
  } catch {
    return false;
  }
}

export interface AlertDetail {
  lastOk: boolean | null;
  lastTps: number | null;
  slowTpsThreshold: number | null;
  graceSeconds: number;
}

/** Strip Discord markdown characters so a monitor name can't restyle the message. */
function plainName(name: string): string {
  return name.replace(/[*_~`|>\\]/g, "");
}

export function alertMessage(name: string, alert: AlertKind, state: MonitorState, d: AlertDetail): string {
  const n = `**${plainName(name)}**`;
  const tps = d.lastTps !== null ? ` · ${d.lastTps} tok/s` : "";
  if (alert === "recovery") return `🟢 ${n} recovered (now ${state}${tps}).`;
  if (alert === "down") {
    return d.lastOk === false
      ? `🔴 ${n} is DOWN: the box checked in, but its LLM server isn't answering.`
      : `🔴 ${n} is DOWN: no heartbeat for over ${d.graceSeconds}s.`;
  }
  const limit = d.slowTpsThreshold !== null ? ` (your threshold is ${d.slowTpsThreshold})` : "";
  return `🟠 ${n} is SLOW: ${d.lastTps ?? "?"} tok/s${limit}.`;
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
  const message = alertMessage(monitorName, alert, state, detail);
  const payload = isDiscordUrl(webhookUrl)
    ? { content: message, username: "Paw Pulse" }
    : {
        content: message,
        monitor_name: monitorName,
        alert,
        state,
        timestamp: new Date(nowMs).toISOString(),
      };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Swallow delivery errors; the next degraded/recovery transition will try again.
  }
}
