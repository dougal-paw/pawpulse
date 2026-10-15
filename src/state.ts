// Pure state-machine logic for Paw Pulse monitors. No I/O, no Workers APIs,
// so this can be unit tested directly with node's test runner.

export type MonitorState = "new" | "up" | "down" | "slow";

export interface StateInput {
  /** ms epoch of the last received beat, or null if none yet. */
  last_beat_at: number | null;
  /** value of `ok` on the last beat, or null if none yet. */
  last_ok: boolean | null;
  /** tokens_per_sec reported on the last beat, or null. */
  last_tps: number | null;
  /** configured slow threshold, or null if not configured. */
  slow_tps_threshold: number | null;
  grace_seconds: number;
}

/**
 * Compute the current state of a monitor given "now" and its last-known beat.
 * This is deliberately a pure function of (now, lastBeat) so it can be used
 * both when a beat arrives and when the cron sweeps for expired monitors.
 */
export function computeState(nowMs: number, m: StateInput): MonitorState {
  if (m.last_beat_at == null) return "new";

  const ageSeconds = (nowMs - m.last_beat_at) / 1000;
  if (ageSeconds > m.grace_seconds) return "down";
  if (m.last_ok === false) return "down";

  if (
    m.slow_tps_threshold != null &&
    m.last_tps != null &&
    m.last_tps < m.slow_tps_threshold
  ) {
    return "slow";
  }

  return "up";
}

export type AlertKind = "down" | "slow" | "recovery";

/**
 * Decide whether a state transition should fire a webhook alert, given the
 * state we last alerted on ("down" or "slow" while degraded, or null/"up"
 * while healthy). Fires once when a monitor goes down, once when it first
 * becomes slow (not already down), and once on recovery to "up".
 */
export function alertToFire(
  prevAlertedState: MonitorState | null,
  newState: MonitorState,
): AlertKind | null {
  if (prevAlertedState === newState) return null;

  const prevDegraded = prevAlertedState === "down" || prevAlertedState === "slow";

  if (newState === "down") return "down";
  if (newState === "slow") return prevDegraded ? null : "slow";
  if (newState === "up" && prevDegraded) return "recovery";
  return null;
}
