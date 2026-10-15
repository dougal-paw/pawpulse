import { test } from "node:test";
import assert from "node:assert/strict";
import { alertMessage } from "../src/webhook.ts";

const d = { lastOk: true, lastTps: 40.9, slowTpsThreshold: 10, graceSeconds: 60 };

test("down says the LLM server is unreachable when the box reported ok:false", () => {
  assert.match(alertMessage("home-ollama", "down", "down", { ...d, lastOk: false }), /isn't answering/);
});
test("down says no heartbeat when beats stopped", () => {
  assert.match(alertMessage("home-ollama", "down", "down", d), /no heartbeat for over 60s/);
});
test("recovery and slow include tok/s", () => {
  assert.match(alertMessage("home-ollama", "recovery", "up", d), /40\.9 tok\/s/);
  assert.match(alertMessage("home-ollama", "slow", "slow", { ...d, lastTps: 3 }), /3 tok\/s \(your threshold is 10\)/);
});
test("markdown is stripped from names", () => {
  assert.match(alertMessage("**x**_`y`", "down", "down", d), /\*\*xy\*\*/);
});
