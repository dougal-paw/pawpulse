// Cron sweep: runs every minute. Recomputes live state for monitors that have
// received at least one beat, persists state transitions, and fires at most
// one webhook alert per state change (respecting the Workers free-tier
// 50-subrequest-per-invocation limit by capping outbound webhook fetches).

import type { Env } from "./env.ts";
import { computeState, alertToFire } from "./state.ts";
import { listMonitorsForSweep, updateMonitorSweepState, type MonitorRow } from "./db.ts";
import { sendWebhookAlert } from "./webhook.ts";

const SWEEP_LIMIT = 300; // monitors inspected per tick (D1 reads, cheap)
const MAX_WEBHOOKS_PER_RUN = 40; // stays well under the 50-subrequest cap

function rowState(m: MonitorRow) {
  return {
    last_beat_at: m.last_beat_at,
    last_ok: m.last_ok === null ? null : m.last_ok === 1,
    last_tps: m.last_tps,
    slow_tps_threshold: m.slow_tps_threshold,
    last_gpu_pct: m.last_gpu_pct,
    min_gpu_pct: m.min_gpu_pct,
    grace_seconds: m.grace_seconds,
  };
}

export async function runCronSweep(env: Env, nowMs: number): Promise<{ checked: number; alerted: number }> {
  const alertsEnabled = env.ALERTS_ENABLED === "true";
  const monitors = await listMonitorsForSweep(env.DB, SWEEP_LIMIT);

  let alerted = 0;

  for (const monitor of monitors) {
    const newState = computeState(nowMs, rowState(monitor));
    const stateChanged = newState !== monitor.state;
    const alert = alertToFire(monitor.alerted_state, newState);
    const alertedState = alert ? newState : monitor.alerted_state;

    if (stateChanged || alertedState !== monitor.alerted_state) {
      await updateMonitorSweepState(env.DB, monitor.id, newState, stateChanged, nowMs, alertedState);
    }

    if (alert && alertsEnabled && monitor.webhook_url && alerted < MAX_WEBHOOKS_PER_RUN) {
      alerted++;
      const rs = rowState(monitor);
      await sendWebhookAlert(
        monitor.webhook_url,
        monitor.name,
        alert,
        newState,
        { lastOk: rs.last_ok, lastTps: rs.last_tps, slowTpsThreshold: rs.slow_tps_threshold, lastGpuPct: rs.last_gpu_pct, minGpuPct: rs.min_gpu_pct, graceSeconds: rs.grace_seconds },
        nowMs,
      );
    }
  }

  return { checked: monitors.length, alerted };
}
