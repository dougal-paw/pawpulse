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

import { buildRequest, targetFor } from "../src/webhook.ts";

test("targets are detected from the webhook URL", () => {
  assert.equal(targetFor("https://discord.com/api/webhooks/1/x"), "discord");
  assert.equal(targetFor("https://hooks.slack.com/services/T/B/x"), "slack");
  assert.equal(targetFor("https://acme.webhook.office.com/webhookb2/x"), "teams");
  assert.equal(targetFor("https://prod-01.westeurope.logic.azure.com/workflows/x"), "teams");
  assert.equal(targetFor("https://api.telegram.org/bot123:abc/sendMessage?chat_id=42"), "telegram");
  assert.equal(targetFor("https://chat.googleapis.com/v1/spaces/x/messages?key=k"), "gchat");
  assert.equal(targetFor("https://example.com/hook"), "generic");
});

test("telegram moves chat_id into the body and sends plain text", () => {
  const r = buildRequest("https://api.telegram.org/bot123:abc/sendMessage?chat_id=42", "box", "down", "down", d, 0);
  assert.equal(r.url, "https://api.telegram.org/bot123:abc/sendMessage");
  const b = JSON.parse(r.body);
  assert.equal(b.chat_id, "42");
  assert.ok(!b.text.includes("*"));
});

test("slack uses single-asterisk bold", () => {
  assert.match(JSON.parse(buildRequest("https://hooks.slack.com/services/x", "box", "down", "down", d, 0).body).text, /^🔴 \*box\* /);
});

test("teams gets an adaptive card", () => {
  const b = JSON.parse(buildRequest("https://x.webhook.office.com/w", "box", "recovery", "up", d, 0).body);
  assert.equal(b.attachments[0].content.type, "AdaptiveCard");
});

test("alertMessage: slow because of CPU fallback names the GPU share", () => {
  const msg = alertMessage("box", "slow", "slow", { lastOk: true, lastTps: 3, slowTpsThreshold: null, lastGpuPct: 12, minGpuPct: 90, graceSeconds: 300 });
  assert.match(msg, /12% of the model is on the GPU/);
});
