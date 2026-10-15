import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCreateMonitor,
  validatePatchMonitor,
  validateBeat,
  ValidationError,
} from "../src/validation.ts";

test("validateCreateMonitor: defaults when empty object given", () => {
  const v = validateCreateMonitor({});
  assert.equal(v.name, "unnamed monitor");
  assert.equal(v.grace_seconds, 300);
  assert.equal(v.slow_tps_threshold, null);
  assert.equal(v.webhook_url, null);
  assert.equal(v.public, false);
});

test("validateCreateMonitor: accepts valid full payload", () => {
  const v = validateCreateMonitor({
    name: "home-box",
    grace_seconds: 600,
    slow_tps_threshold: 3.5,
    webhook_url: "https://example.com/hook",
    public: true,
  });
  assert.equal(v.name, "home-box");
  assert.equal(v.grace_seconds, 600);
  assert.equal(v.slow_tps_threshold, 3.5);
  assert.equal(v.webhook_url, "https://example.com/hook");
  assert.equal(v.public, true);
});

test("validateCreateMonitor: rejects grace_seconds out of range", () => {
  assert.throws(() => validateCreateMonitor({ grace_seconds: 10 }), ValidationError);
  assert.throws(() => validateCreateMonitor({ grace_seconds: 999999 }), ValidationError);
  assert.throws(() => validateCreateMonitor({ grace_seconds: 60.5 }), ValidationError);
});

test("validateCreateMonitor: rejects non-https webhook_url", () => {
  assert.throws(() => validateCreateMonitor({ webhook_url: "http://example.com/hook" }), ValidationError);
  assert.throws(() => validateCreateMonitor({ webhook_url: "not a url" }), ValidationError);
});

test("validateCreateMonitor: rejects empty or overlong name", () => {
  assert.throws(() => validateCreateMonitor({ name: "" }), ValidationError);
  assert.throws(() => validateCreateMonitor({ name: "x".repeat(101) }), ValidationError);
});

test("validateCreateMonitor: rejects non-boolean public", () => {
  assert.throws(() => validateCreateMonitor({ public: "yes" }), ValidationError);
});

test("validatePatchMonitor: only validates provided fields", () => {
  const v = validatePatchMonitor({ grace_seconds: 120 });
  assert.deepEqual(v, { grace_seconds: 120 });
});

test("validatePatchMonitor: rejects empty patch", () => {
  assert.throws(() => validatePatchMonitor({}), ValidationError);
});

test("validatePatchMonitor: can clear webhook_url and threshold with null", () => {
  const v = validatePatchMonitor({ webhook_url: null, slow_tps_threshold: null });
  assert.deepEqual(v, { webhook_url: null, slow_tps_threshold: null });
});

test("validateBeat: requires ok boolean", () => {
  assert.throws(() => validateBeat({}), ValidationError);
  assert.throws(() => validateBeat({ ok: "true" }), ValidationError);
});

test("validateBeat: accepts minimal valid beat", () => {
  const v = validateBeat({ ok: true });
  assert.equal(v.ok, true);
  assert.equal(v.models, null);
  assert.equal(v.tokens_per_sec, null);
  assert.equal(v.latency_ms, null);
  assert.equal(v.note, null);
});

test("validateBeat: accepts full valid beat", () => {
  const v = validateBeat({
    ok: true,
    models: ["llama3", "qwen2.5"],
    tokens_per_sec: 12.3,
    latency_ms: 450,
    note: "all good",
  });
  assert.equal(v.tokens_per_sec, 12.3);
  assert.deepEqual(v.models, ["llama3", "qwen2.5"]);
});

test("validateBeat: rejects note over 200 chars", () => {
  assert.throws(() => validateBeat({ ok: true, note: "x".repeat(201) }), ValidationError);
});

test("validateBeat: rejects negative tokens_per_sec", () => {
  assert.throws(() => validateBeat({ ok: true, tokens_per_sec: -1 }), ValidationError);
});

test("validateBeat: rejects non-array models", () => {
  assert.throws(() => validateBeat({ ok: true, models: "llama3" }), ValidationError);
});
