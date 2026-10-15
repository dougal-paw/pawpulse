// Generates demo.svg: a 12s looping animated demo of Paw Pulse.
import fs from 'fs';
const T = 12; // seconds per loop
const pct = s => +(s / T * 100).toFixed(2);
let css = '', id = 0;
// Element appears at time `on` (s) and optionally disappears at `off` (s).
function show(on, off = T * 0.96) {
  const n = `a${id++}`, a = pct(on), b = pct(off);
  css += `@keyframes ${n}{0%,${a}%{opacity:0;transform:translateY(4px)}${(a + 1.5).toFixed(2)}%,${b}%{opacity:1;transform:none}${Math.min(b + 1.5, 100).toFixed(2)}%,100%{opacity:0}}\n.${n}{animation:${n} ${T}s infinite;opacity:0}\n`;
  return n;
}
function pulse(times) { // dot travelling from box to cloud
  const n = `p${id++}`; let k = '0%{transform:translateX(0);opacity:0}';
  for (const t of times) { const a = pct(t); k += `${a}%{transform:translateX(0);opacity:0}${(a + .5).toFixed(2)}%{opacity:1}${(a + 7).toFixed(2)}%{transform:translateX(170px);opacity:1}${(a + 7.5).toFixed(2)}%{transform:translateX(170px);opacity:0}`; }
  css += `@keyframes ${n}{${k}100%{opacity:0}}\n.${n}{animation:${n} ${T}s infinite linear;opacity:0}\n`;
  return n;
}
const sans = `-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif`;
const mono = `font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;
const term = [
  [0.2, '<tspan fill="#7ee787">pi@homelab</tspan><tspan fill="#8b949e">:~$</tspan> tail -f pulse.log'],
  [1.0, '<tspan fill="#8b949e">18:07</tspan> <tspan fill="#ff7b9c">♥</tspan> beat ok  qwen3:8b  <tspan fill="#79c0ff">41.2 tok/s</tspan>'],
  [2.4, '<tspan fill="#8b949e">18:08</tspan> <tspan fill="#ff7b9c">♥</tspan> beat ok  qwen3:8b  <tspan fill="#79c0ff">40.8 tok/s</tspan>'],
  [3.8, '<tspan fill="#8b949e">18:09</tspan> <tspan fill="#ff7b9c">♥</tspan> beat ok  qwen3:8b  <tspan fill="#79c0ff">41.0 tok/s</tspan>'],
  [5.0, '<tspan fill="#f85149">18:10 × beat FAIL  LLM server unreachable</tspan>'],
  [7.6, '<tspan fill="#8b949e" font-style="italic">  … alert on your phone, restart ollama …</tspan>'],
  [8.6, '<tspan fill="#8b949e">18:14</tspan> <tspan fill="#ff7b9c">♥</tspan> beat ok  qwen3:8b  <tspan fill="#79c0ff">40.9 tok/s</tspan>'],
];
const termSvg = term.map(([t, s], i) => `<text class="${show(t)}" x="44" y="${132 + i * 27}" style="${mono};font-size:14.5px" fill="#e6edf3">${s}</text>`).join('\n');
const p = pulse([1.0, 2.4, 3.8, 8.6]);
const down = show(6.0, 9.4), up1 = show(0, 5.9), up2 = show(9.4);
const msg1 = show(6.0), msg2 = show(9.4);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 440" width="1000" height="440" role="img" aria-labelledby="t d">
<title id="t">Paw Pulse demo</title>
<desc id="d">A script on a home server sends heartbeats out to Paw Pulse. When Ollama is killed, Paw Pulse posts "home-ollama is DOWN" to Discord, then "recovered" after a restart. No inbound ports are opened.</desc>
<style>
${css}text{white-space:pre}
@media (prefers-reduced-motion: reduce){[class^=a],[class^=p]{animation:none!important;opacity:1!important;transform:none!important}.${down},.${up1},.${p}{opacity:0!important}}
</style>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a1033"/><stop offset="1" stop-color="#0b1e2d"/></linearGradient>
<linearGradient id="wire" x1="0" x2="1"><stop offset="0" stop-color="#ff7b9c"/><stop offset="1" stop-color="#a371f7"/></linearGradient>
<filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="1000" height="440" rx="18" fill="url(#bg)"/>
<!-- terminal -->
<rect x="24" y="64" width="470" height="352" rx="12" fill="#0d1117" stroke="#30363d"/>
<circle cx="46" cy="86" r="6" fill="#ff5f57"/><circle cx="66" cy="86" r="6" fill="#febc2e"/><circle cx="86" cy="86" r="6" fill="#28c840"/>
<text x="259" y="91" text-anchor="middle" style="${mono};font-size:13px" fill="#8b949e">your home AI box · no open ports</text>
${termSvg}
<text x="24" y="42" style="font-family:${sans};font-size:22px;font-weight:700" fill="#fff">Ollama died at 18:10. <tspan fill="#ff7b9c">You knew at 18:11.</tspan></text>
<!-- wire -->
<line x1="500" y1="240" x2="680" y2="240" stroke="#c58cff" stroke-width="2" stroke-dasharray="5 6" opacity=".7"/>
<text x="590" y="226" text-anchor="middle" style="font-family:${sans};font-size:12px" fill="#c9b8ff">outbound heartbeat</text>
<text x="590" y="262" text-anchor="middle" style="font-family:${sans};font-size:12px" fill="#8b949e">nothing exposed</text>
<circle class="${p}" cx="505" cy="240" r="6" fill="#ff7b9c" filter="url(#glow)"/>
<!-- right panel -->
<rect x="684" y="64" width="292" height="104" rx="12" fill="#161b22" stroke="#30363d"/>
<text x="704" y="94" style="font-family:${sans};font-size:13px;font-weight:600" fill="#8b949e">🐾 PAW PULSE</text>
<text x="704" y="134" style="${mono};font-size:18px" fill="#e6edf3">home-ollama</text>
<g class="${up1}"><rect x="880" y="114" width="76" height="28" rx="14" fill="#1f6f3b"/><text x="918" y="133" text-anchor="middle" style="font-family:${sans};font-size:13px;font-weight:700" fill="#7ee787">● UP</text></g>
<g class="${down}"><rect x="866" y="114" width="90" height="28" rx="14" fill="#6e1b1b"/><text x="911" y="133" text-anchor="middle" style="font-family:${sans};font-size:13px;font-weight:700" fill="#ff7b72">● DOWN</text></g>
<g class="${up2}"><rect x="880" y="114" width="76" height="28" rx="14" fill="#1f6f3b"/><text x="918" y="133" text-anchor="middle" style="font-family:${sans};font-size:13px;font-weight:700" fill="#7ee787">● UP</text></g>
<!-- discord -->
<rect x="684" y="184" width="292" height="232" rx="12" fill="#313338"/>
<text x="704" y="212" style="font-family:${sans};font-size:13px;font-weight:600" fill="#949ba4"># homelab-alerts</text>
<line x1="684" y1="226" x2="976" y2="226" stroke="#1e1f22"/>
<g class="${msg1}"><circle cx="718" cy="258" r="16" fill="#a371f7"/><text x="718" y="264" text-anchor="middle" font-size="16">🐾</text>
<text x="744" y="252" style="font-family:${sans};font-size:14px;font-weight:600" fill="#f2f3f5">Paw Pulse </text><rect x="822" y="240" width="30" height="16" rx="3" fill="#5865f2"/><text x="837" y="252" text-anchor="middle" style="font-family:${sans};font-size:10px;font-weight:700" fill="#fff">BOT</text>
<text x="862" y="252" style="font-family:${sans};font-size:11px" fill="#949ba4">Today at 18:11</text><text x="744" y="274" style="font-family:${sans};font-size:13.5px" fill="#f2f3f5">🔴 <tspan font-weight="700">home-ollama</tspan> is DOWN:</text>
<text x="744" y="292" style="font-family:${sans};font-size:12.5px" fill="#dbdee1">the box checked in, but its LLM server</text><text x="744" y="308" style="font-family:${sans};font-size:12.5px" fill="#dbdee1">isn't answering.</text></g>
<g class="${msg2}"><circle cx="718" cy="350" r="16" fill="#a371f7"/><text x="718" y="356" text-anchor="middle" font-size="16">🐾</text>
<text x="744" y="344" style="font-family:${sans};font-size:14px;font-weight:600" fill="#f2f3f5">Paw Pulse</text><rect x="822" y="332" width="30" height="16" rx="3" fill="#5865f2"/><text x="837" y="344" text-anchor="middle" style="font-family:${sans};font-size:10px;font-weight:700" fill="#fff">BOT</text><text x="862" y="344" style="font-family:${sans};font-size:11px" fill="#949ba4">Today at 18:14</text>
<text x="744" y="366" style="font-family:${sans};font-size:13.5px" fill="#f2f3f5">🟢 <tspan font-weight="700">home-ollama</tspan> recovered</text>
<text x="744" y="384" style="font-family:${sans};font-size:12.5px" fill="#dbdee1">(now up · 40.9 tok/s).</text></g>
</svg>`;
fs.writeFileSync(new URL('./demo.svg', import.meta.url), svg);
console.log('bytes', svg.length);
fs.writeFileSync(new URL('../src/static/demo-svg.ts', import.meta.url),
  `// Generated by design/gen-demo.mjs — edit that, not this.\nexport const DEMO_SVG = ${JSON.stringify(svg)};\n`);
