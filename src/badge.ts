import type { MonitorState } from "./state.ts";

const COLORS: Record<MonitorState, string> = {
  up: "#2ecc71",
  slow: "#f1c40f",
  down: "#e74c3c",
  new: "#95a5a6",
};

const LABELS: Record<MonitorState, string> = {
  up: "up",
  slow: "slow",
  down: "down",
  new: "new",
};

// Rough per-character width estimate for Verdana 11px, good enough for a
// shields.io-style flat badge without pulling in a font metrics library.
function textWidth(s: string): number {
  return Math.round(s.length * 6.5) + 10;
}

/** Render a minimal shields.io-style flat badge as inline SVG. */
export function renderBadge(state: MonitorState): string {
  return renderCustomBadge(LABELS[state], COLORS[state]);
}

/** Render a badge with an arbitrary right-hand label/color (e.g. "private", "not found"). */
export function renderCustomBadge(right: string, color: string): string {
  const left = "paw pulse";
  const leftWidth = textWidth(left);
  const rightWidth = textWidth(right);
  const totalWidth = leftWidth + rightWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${left}: ${right}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftWidth}" height="20" fill="#555"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${leftWidth / 2}" y="14">${left}</text>
    <text x="${leftWidth + rightWidth / 2}" y="14">${right}</text>
  </g>
</svg>`;
}
