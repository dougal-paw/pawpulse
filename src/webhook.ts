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

function alertMessage(name: string, alert: AlertKind, state: MonitorState): string {
  if (alert === "recovery") return `Paw Pulse: "${name}" has recovered (now ${state}).`;
  if (alert === "down") return `Paw Pulse: "${name}" is DOWN (no heartbeat within grace period).`;
  return `Paw Pulse: "${name}" is SLOW (tokens/sec below threshold).`;
}

/** Best-effort webhook delivery. Never throws — a failed alert must not break the cron sweep. */
export async function sendWebhookAlert(
  webhookUrl: string,
  monitorName: string,
  alert: AlertKind,
  state: MonitorState,
  nowMs: number,
): Promise<void> {
  const message = alertMessage(monitorName, alert, state);
  const payload = isDiscordUrl(webhookUrl)
    ? { content: message }
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
