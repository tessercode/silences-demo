// Shared helpers: result type, colours from the CSS tokens, tooltip, the gap strip geometry.
import * as d3 from "d3";

// One run of demo_api.run, as JSON. Loosely typed: the panels read the fields they draw.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Result = Record<string, any>;

export const CLASS_NAMES = ["intra-letter", "inter-letter", "inter-word"];
export const SEGMENTER_NAMES: Record<string, string> = {
  spk: "LIF fed spikes",
  lif: "LIF fed currents",
  mlp: "tanh MLP",
  bigru: "BiGRU (5-seed)",
  oracle: "Oracle gap labels",
};

export function css(name: string): string {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

export function classColor(k: number): string {
  return css(`--class-${k}`);
}

/** Blue (negative) - gray - red (positive), clamped at +-maxAbs. */
export function diverging(maxAbs: number) {
  return d3
    .scaleLinear<string>()
    .domain([-maxAbs, 0, maxAbs])
    .range([css("--div-neg"), css("--div-mid"), css("--div-pos")])
    .interpolate(d3.interpolateLab)
    .clamp(true);
}

/** One hue, near-surface (small) to dark (large) in light mode, the reverse ramp in dark mode. */
export function sequential(lo: number, hi: number) {
  return d3
    .scaleLinear<string>()
    .domain([lo, hi])
    .range([css("--seq-lo"), css("--seq-hi")])
    .interpolate(d3.interpolateLab)
    .clamp(true);
}

const tip = document.createElement("div");
tip.className = "tooltip";
tip.setAttribute("role", "tooltip");
document.body.append(tip);

export function showTip(ev: MouseEvent, html: string) {
  tip.innerHTML = html;
  tip.style.opacity = "1";
  const r = tip.getBoundingClientRect();
  let x = ev.clientX + 14;
  let y = ev.clientY + 14;
  if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - 14;
  if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - 14;
  tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
}

export function hideTip() {
  tip.style.opacity = "0";
}

export function svgIn(container: HTMLElement, width: number, height: number) {
  container.replaceChildren();
  return d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...children);
  return e;
}

export const fmt2 = d3.format(".2f");
export const fmt3 = d3.format(".3f");
export const pct = d3.format(".1%");

/** Q16.16 integer to float. */
export const q = (v: number) => v / 65536;

/** Horizontal geometry shared by every per-gap strip, so they line up and scroll together. */
export interface GapStrip {
  n: number;
  gw: number; // pixels per gap
  left: number; // left margin for row labels
  width: number;
  x: (i: number) => number; // left edge of gap i
}

export function gapStrip(n: number, available: number, left = 96): GapStrip {
  const gw = Math.max(5, Math.min(16, Math.floor((available - left - 8) / Math.max(n, 1))));
  return { n, gw, left, width: left + n * gw + 8, x: (i) => left + i * gw };
}

/** Keep every .gapscroll container scrolled together. */
let syncing = false;
export function syncGapScroll() {
  const boxes = Array.from(document.querySelectorAll<HTMLElement>(".gapscroll"));
  for (const b of boxes) {
    b.onscroll = () => {
      if (syncing) return;
      syncing = true;
      for (const o of boxes) if (o !== b) o.scrollLeft = b.scrollLeft;
      syncing = false;
    };
  }
}

/** Scroll every gap strip so gap i is in view. */
export function revealGap(strip: GapStrip, i: number) {
  for (const b of document.querySelectorAll<HTMLElement>(".gapscroll")) {
    const x = strip.x(i);
    if (x < b.scrollLeft + strip.left || x > b.scrollLeft + b.clientWidth - 40) b.scrollLeft = x - b.clientWidth / 2;
  }
}

/** Character-level alignment of truth and decoded text: [op, truthChar, decodedChar][] with
 *  op = "=" match, "~" substitution, "-" deletion (missed), "+" insertion. */
export function alignChars(a: string, b: string): [string, string, string][] {
  const n = a.length;
  const m = b.length;
  const D = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const ops: [string, string, string][] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      ops.push([a[i - 1] === b[j - 1] ? "=" : "~", a[i - 1], b[j - 1]]);
      i--;
      j--;
    } else if (i > 0 && D[i][j] === D[i - 1][j] + 1) {
      ops.push(["-", a[i - 1], ""]);
      i--;
    } else {
      ops.push(["+", "", b[j - 1]]);
      j--;
    }
  }
  return ops.reverse();
}

/** The intended element of every mark (from the text's Morse), to spot channel errors. */
export function intendedChannels(r: Result): number[] {
  const out: number[] = [];
  for (const w of (r.text_clean as string).split(" "))
    for (const c of w) for (const e of r.morse[c] as string) out.push(e === "." ? 0 : 1);
  return out;
}
