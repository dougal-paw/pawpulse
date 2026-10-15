import type { StatusResult } from "./service.ts";

const BASE_CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  background: #fafafa; color: #1a1a1a; line-height: 1.55;
}
@media (prefers-color-scheme: dark) {
  body { background: #0e0e10; color: #e8e8e8; }
  a { color: #7db8ff; }
  code, pre { background: #1c1c1f !important; color: #e8e8e8 !important; }
  .card { background: #18181b !important; border-color: #2a2a2e !important; }
  .muted { color: #9a9aa2 !important; }
}
a { color: #1763c7; }
.wrap { max-width: 760px; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
h1 { font-size: 1.8rem; margin: 0 0 .25rem; }
h2 { font-size: 1.15rem; margin: 2rem 0 .5rem; }
.tagline { font-size: 1.05rem; margin: 0 0 1.5rem; opacity: .85; }
.muted { color: #666; font-size: .92rem; }
.card { border: 1px solid #e3e3e3; border-radius: 10px; padding: 1rem 1.25rem; margin: 1rem 0; background: #fff; }
code, pre { background: #f1f1f3; border-radius: 6px; padding: .15rem .4rem; font-size: .88em; }
pre { padding: .9rem 1rem; overflow-x: auto; }
pre code { padding: 0; background: none; }
ol, ul { padding-left: 1.3rem; }
footer { margin-top: 3rem; font-size: .85rem; opacity: .7; }
.pill { display: inline-block; padding: .15rem .55rem; border-radius: 999px; font-size: .8rem; font-weight: 600; color: #fff; }
.pill-up { background: #2ecc71; }
.pill-slow { background: #d79f00; }
.pill-down { background: #e74c3c; }
.pill-new { background: #95a5a6; }
nav a { margin-right: 1rem; font-size: .9rem; }
.hero { background: radial-gradient(ellipse at top left, #3b1d6e 0%, #140b2a 45%, #0b1e2d 100%); color: #fff; padding: 1.5rem 1.25rem 2.5rem; }
.hero-in { max-width: 1040px; margin: 0 auto; }
.hero nav a { color: #c9b8ff; }
.hero h1 { font-size: clamp(2rem, 5vw, 3.2rem); line-height: 1.1; margin: 2.2rem 0 .8rem; letter-spacing: -.02em; }
.hero h1 em { font-style: normal; color: #ff7b9c; }
.hero .tagline { font-size: clamp(1.05rem, 2.2vw, 1.3rem); max-width: 40rem; opacity: .9; }
.cta { display: inline-block; padding: .75rem 1.3rem; border-radius: 10px; font-weight: 700; text-decoration: none; margin: .3rem .6rem .3rem 0; }
.cta-main { background: #ff7b9c; color: #1a0b1f !important; box-shadow: 0 6px 24px rgba(255,123,156,.35); }
.cta-alt { border: 1px solid #6c5aa8; color: #e6deff !important; }
.demo { display: block; width: 100%; height: auto; margin-top: 2rem; border-radius: 18px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 2rem; }
.tile { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 1rem 1.1rem; }
.tile b { display: block; font-size: 1.05rem; margin-bottom: .25rem; }
.tile span { opacity: .8; font-size: .93rem; }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="Paw Pulse: a push-based heartbeat and performance monitor for self-hosted LLM servers.">
<style>${BASE_CSS}</style>
</head>
<body>
${body.includes('class="hero"') ? body.slice(0, body.indexOf("<!--/hero-->")) : ""}
<div class="wrap">
${body.includes('class="hero"') ? body.slice(body.indexOf("<!--/hero-->")) : body}
<footer>
  Paw Pulse is built and run by an AI agent (Nano), as part of Dougal Paw.
  &middot; <a href="/privacy">Privacy</a>
  &middot; <a href="/openapi.json">OpenAPI</a>
  &middot; <a href="/llms.txt">llms.txt</a>
</footer>
</div>
</body>
</html>`;
}

export function landingPage(): string {
  const body = `
<header class="hero"><div class="hero-in">
<nav><a href="/"><strong>🐾 Paw Pulse</strong></a><a href="#quick-start">Quick start</a><a href="/openapi.json">API</a><a href="https://github.com/dougal-paw/pawpulse">Source</a></nav>
<h1>Your home AI box just died.<br><em>Find out in minutes, not days.</em></h1>
<p class="tagline">Paw Pulse watches your Ollama, llama.cpp or vLLM server and pings Discord the moment it goes down,
gets slow, or comes back. No open ports, nothing to install but one small shell script.</p>
<a class="cta cta-main" href="#quick-start">Set it up free &rarr;</a><a class="cta cta-alt" href="https://github.com/dougal-paw/pawpulse">Open source on GitHub</a>
<img class="demo" src="/demo.svg" width="1000" height="440" alt="Demo: heartbeats from a home server, Ollama fails at 18:10, Paw Pulse posts 'home-ollama is DOWN' to Discord at 18:11, then 'recovered' after a restart.">
<div class="tiles">
  <div class="tile"><b>🔒 Nothing exposed</b><span>Your box sends heartbeats out. Nothing on the internet can reach your LLM server.</span></div>
  <div class="tile"><b>🔔 One alert, not fifty</b><span>Down, slow and recovered: one message per change, straight to Discord or any webhook.</span></div>
  <div class="tile"><b>⚡ Tokens/sec, too</b><span>Optionally times a tiny generation, so you hear when it's alive but crawling.</span></div>
</div>
</div></header>
<!--/hero-->

<div class="card">
  <strong>Why push, not pull?</strong>
  <p class="muted" style="margin:.4rem 0 0">
    Most uptime monitors work by polling your server from the outside, which means punching a hole
    in your firewall and exposing Ollama/llama.cpp/vLLM to the open internet. Paw Pulse flips that
    around: a tiny script on your machine sends a heartbeat <em>out</em> to us every few minutes. If the
    heartbeats stop, we notice. Your LLM server never has to accept a single inbound connection.
  </p>
</div>

<h2 id="quick-start">Quick start</h2>
<ol>
  <li>
    Create a monitor:
    <pre><code>curl -X POST https://pawpulse.dougalpaw.workers.dev/v1/monitors \\
  -H 'content-type: application/json' \\
  -d '{"name":"home-ollama","grace_seconds":300,
       "webhook_url":"https://discord.com/api/webhooks/…"}'</code></pre>
    Save the <code>ingest_token</code> and <code>manage_token</code> from the response &mdash; the ingest
    token is the only credential the client needs, and we cannot recover either one for you.
  </li>
  <li>
    Grab the client script and drop it on the box running your LLM server:
    <pre><code>curl -o /usr/local/bin/pawpulse.sh https://pawpulse.dougalpaw.workers.dev/pawpulse.sh
chmod +x /usr/local/bin/pawpulse.sh</code></pre>
  </li>
  <li>
    Run it on a schedule (cron shown, systemd timers work the same way):
    <pre><code># every 5 minutes
*/5 * * * * PAWPULSE_URL=https://pawpulse.dougalpaw.workers.dev PAWPULSE_ID=&lt;id&gt; PAWPULSE_TOKEN=&lt;ingest_token&gt; /usr/local/bin/pawpulse.sh</code></pre>
    Want the log from the demo above? Add <code>PAWPULSE_VERBOSE=1</code> and append
    <code>&gt;&gt; ~/pulse.log</code>, then <code>tail -f ~/pulse.log</code>.
  </li>
</ol>

<h2>Alerts</h2>
<p>Give a monitor a <code>webhook_url</code> (a Discord channel webhook, or any HTTPS endpoint that
accepts JSON) and you get one message when it goes <strong>down</strong>, one when it gets
<strong>slow</strong> (below your <code>slow_tps_threshold</code>), and one when it
<strong>recovers</strong>. No spam, no repeats. Prefer your own tooling? Point Uptime Kuma or anything
else at <code>/v1/monitors/&lt;id&gt;/status</code> or embed the <code>/badge/&lt;id&gt;.svg</code>.</p>

<h2>What it checks</h2>
<p>The client probes your local Ollama (<code>/api/tags</code>, <code>/api/ps</code>) or any
OpenAI-compatible <code>/v1/models</code> endpoint, reports which models are loaded, and optionally
times a tiny generation to estimate tokens/sec. The tokens/sec probe is <strong>off by default</strong>
since it costs a little compute on your box.</p>

<h2>For agents &amp; scripts</h2>
<p>Everything above is also a plain JSON REST API &mdash; see the
<a href="/openapi.json">OpenAPI 3.1 spec</a> and <a href="/llms.txt">llms.txt</a> for a
machine-readable summary. A minimal remote MCP endpoint is available at <code>/mcp</code>
(tools: <code>create_monitor</code>, <code>get_status</code>, <code>list_heartbeats</code>) &mdash;
see the API docs for details on its current limitations.</p>

<h2>Pricing</h2>
<p>Free during beta.</p>

<h2>Built by an AI agent</h2>
<p class="muted">
  Paw Pulse is designed, built, deployed, and operated by Nano, an AI agent, as part of the
  Dougal Paw project, with a human keeping an eye on the agent. Questions or problems:
  <a href="mailto:pup.dougalpaw@gmail.com">pup.dougalpaw@gmail.com</a> (Nano reads it).
</p>
`;
  return page("Paw Pulse — heartbeat monitor for self-hosted LLMs", body);
}

export function privacyPage(): string {
  const body = `
<nav><a href="/">Paw Pulse</a><a href="/privacy">Privacy</a><a href="/openapi.json">API</a><a href="https://github.com/dougal-paw/pawpulse">Source</a></nav>
<h1>Privacy</h1>
<p class="tagline">Paw Pulse is built to store as little as possible.</p>

<h2>Who we are</h2>
<p>Paw Pulse is part of Dougal Paw and is built and run by Nano, an AI agent, under human oversight.
  The data controller is Dougal Debug Limited (England &amp; Wales). Contact:
  <a href="mailto:pup.dougalpaw@gmail.com">pup.dougalpaw@gmail.com</a>. Under UK GDPR you can ask us to
  access or delete data, or complain to the <a href="https://ico.org.uk/">ICO</a>.</p>

<h2>What we store</h2>
<ul>
  <li>A random monitor id, an ingest token, and a manage token (not derived from anything personal).</li>
  <li>The monitor <strong>name</strong> you choose when creating it &mdash; pick something that isn't
    identifying if that matters to you.</li>
  <li>The last ~500 heartbeats per monitor: timestamp, ok/fail, reported model names, tokens/sec,
    latency, and an optional free-text note (&le;200 characters) that you supply.</li>
  <li>An optional webhook URL, if you set one, used only to deliver alerts.</li>
</ul>

<h2>What we never store</h2>
<ul>
  <li>No accounts, no email addresses, no login of any kind.</li>
  <li>No IP addresses in our database or logs. (Cloudflare, which hosts Paw Pulse, necessarily sees them to deliver requests; see <a href="https://www.cloudflare.com/privacypolicy/">its privacy policy</a>.)</li>
  <li>No cookies, no analytics, no tracking scripts.</li>
  <li>No contents of your prompts or model outputs &mdash; only the numbers above.</li>
</ul>

<h2>Deleting your data</h2>
<p>
  <code>DELETE /v1/monitors/:id</code> with your manage token immediately removes
  the monitor, its webhook URL and every heartbeat associated with it. Deleted rows may persist in
  our database host's point-in-time recovery for up to 30 days before they're gone for good.
</p>

<h2>Alerts</h2>
<p>
  If you set a webhook URL (e.g. a Discord channel webhook), we store it only to send you alerts
  and delete it with the monitor or when you remove it via <code>PATCH</code>. Alert payloads contain
  only the monitor name, state and a timestamp. The service you point the webhook at handles the
  message under its own terms.
</p>
`;
  return page("Paw Pulse — Privacy", body);
}

function pillClass(state: StatusResult["state"]): string {
  return `pill pill-${state}`;
}

export function statusPage(status: StatusResult): string {
  const uptime = status.uptime_24h == null ? "—" : `${(status.uptime_24h * 100).toFixed(1)}%`;
  const body = `
<nav><a href="/">Paw Pulse</a></nav>
<h1>${escapeHtml(status.name)}</h1>
<p><span class="${pillClass(status.state)}">${status.state}</span></p>
<div class="card">
  <p><strong>Last heartbeat:</strong> ${status.last_beat_at ?? "never"}</p>
  <p><strong>Tokens/sec (last):</strong> ${status.last_tps ?? "—"}</p>
  <p><strong>Latency (last):</strong> ${status.last_latency_ms != null ? status.last_latency_ms + " ms" : "—"}</p>
  <p><strong>Uptime (24h):</strong> ${uptime}</p>
  ${status.last_note ? `<p><strong>Note:</strong> ${escapeHtml(status.last_note)}</p>` : ""}
</div>
<p class="muted">Badge: <code>/badge/${status.id}.svg</code></p>
<img src="/badge/${status.id}.svg" alt="status badge" width="1" height="1" style="width:auto;height:20px">
`;
  return page(`${status.name} — Paw Pulse`, body);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function notFoundPage(): string {
  return page("Not found — Paw Pulse", `<h1>Not found</h1><p>This monitor doesn't exist, isn't public, or has been deleted.</p>`);
}
