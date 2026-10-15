import { test } from "node:test";
import assert from "node:assert/strict";
import { computeState, alertToFire } from "../src/state.ts";

const NOW = 1_000_000_000; // ms

test("computeState: no beat yet -> new", () => {
  const s = computeState(NOW, {
    last_beat_at: null,
    last_ok: null,
    last_tps: null,
    slow_tps_threshold: null,
    grace_seconds: 300,
  });
  assert.equal(s, "new");
});

test("computeState: recent ok beat -> up", () => {
  const s = computeState(NOW, {
    last_beat_at: NOW - 10_000,
    last_ok: true,
    last_tps: null,
    slow_tps_threshold: null,
    grace_seconds: 300,
  });
  assert.equal(s, "up");
});

test("computeState: beat older than grace -> down", () => {
  const s = computeState(NOW, {
    last_beat_at: NOW - 301_000,
    last_ok: true,
    last_tps: null,
    slow_tps_threshold: null,
    grace_seconds: 300,
  });
  assert.equal(s, "down");
});

test("computeState: beat exactly at grace boundary is still within grace", () => {
  const s = computeState(NOW, {
    last_beat_at: NOW - 300_000,
    last_ok: true,
    last_tps: null,
    slow_tps_threshold: null,
    grace_seconds: 300,
  });
  assert.equal(s, "up");
});

test("computeState: explicit ok:false beat -> down even within grace", () => {
  const s = computeState(NOW, {
    last_beat_at: NOW - 1_000,
    last_ok: false,
    last_tps: null,
    slow_tps_threshold: null,
    grace_seconds: 300,
  });
  assert.equal(s, "down");
});

test("computeState: tps below threshold -> slow", () => {
  const s = computeState(NOW, {
    last_beat_at: NOW - 1_000,
    last_ok: true,
    last_tps: 2.5,
    slow_tps_threshold: 5,
    grace_seconds: 300,
  });
  assert.equal(s, "slow");
});

test("computeState: tps at or above threshold -> up", () => {
  const s = computeState(NOW, {
    last_beat_at: NOW - 1_000,
    last_ok: true,
    last_tps: 5,
    slow_tps_threshold: 5,
    grace_seconds: 300,
  });
  assert.equal(s, "up");
});

test("computeState: down (expired) takes priority over slow tps", () => {
  const s = computeState(NOW, {
    last_beat_at: NOW - 400_000,
    last_ok: true,
    last_tps: 1,
    slow_tps_threshold: 5,
    grace_seconds: 300,
  });
  assert.equal(s, "down");
});

test("alertToFire: new monitor transitioning up fires nothing", () => {
  assert.equal(alertToFire(null, "up"), null);
  assert.equal(alertToFire(null, "new"), null);
});

test("alertToFire: first down transition fires 'down'", () => {
  assert.equal(alertToFire(null, "down"), "down");
  assert.equal(alertToFire("up", "down"), "down");
});

test("alertToFire: repeated down does not re-fire", () => {
  assert.equal(alertToFire("down", "down"), null);
});

test("alertToFire: first slow transition fires 'slow'", () => {
  assert.equal(alertToFire("up", "slow"), "slow");
  assert.equal(alertToFire(null, "slow"), "slow");
});

test("alertToFire: slow while already down does not re-fire", () => {
  assert.equal(alertToFire("down", "slow"), null);
});

test("alertToFire: recovery from down to up fires 'recovery'", () => {
  assert.equal(alertToFire("down", "up"), "recovery");
});

test("alertToFire: recovery from slow to up fires 'recovery'", () => {
  assert.equal(alertToFire("slow", "up"), "recovery");
});

test("alertToFire: up to up fires nothing", () => {
  assert.equal(alertToFire("up", "up"), null);
});
