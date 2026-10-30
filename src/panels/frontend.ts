// Panel 3: what the front end hands on. It sees only completion times and channel bits; each gap's
// interval (gap + the next mark) is measured in its own time-unit estimate T̂u. Nominal intervals sit at
// 2, 4, 6, 8, 10 T_u of the fist's base speed (drawn converted into T̂u units), and 4 is ambiguous:
// a 1 T_u gap before a dash and a 3 T_u gap before a dot.
import * as d3 from "d3";
import { CLASS_NAMES, GapStrip, Result, classColor, css, hideTip, showTip, svgIn } from "../common";

const REFS: [number, string][] = [
  [2, "intra + dot"],
  [4, "intra + dash = letter + dot"],
  [6, "letter + dash"],
  [8, "word + dot"],
  [10, "word + dash"],
];

export function renderFrontEnd(box: HTMLElement, r: Result, strip: GapStrip, selected: number, onSelect: (g: number) => void) {
  const iv: number[] = r.interval_tu;
  const labels: number[] = r.labels;
  const nextCh: number[] = r.marks.slice(1).map((m: number[]) => m[1]);
  const H = 230;
  const top = 10;
  const bottom = H - 22;
  const k = r.nominal_tu_us / r.tu_us; // nominal T_u in T̂u units
  const ext = d3.extent([...iv, 2 * k, 10 * k]) as [number, number];
  const y = d3.scaleLog().domain([ext[0] / 1.15, ext[1] * 1.15]).range([bottom, top]).clamp(true);
  const svg = svgIn(box, strip.width, H);

  svg
    .append("rect")
    .attr("x", strip.x(selected))
    .attr("width", strip.gw)
    .attr("y", top)
    .attr("height", bottom - top)
    .attr("fill", css("--select"));

  const refs = svg.append("g").attr("class", "grid");
  refs
    .selectAll("line")
    .data(REFS)
    .join("line")
    .attr("x1", strip.left)
    .attr("x2", strip.width - 8)
    .attr("y1", (d) => y(d[0] * k))
    .attr("y2", (d) => y(d[0] * k))
    .attr("stroke-dasharray", (d) => (d[0] === 4 ? "none" : "3 3"))
    .style("stroke", (d) => (d[0] === 4 ? css("--axis") : null));
  svg
    .append("g")
    .selectAll("text")
    .data(REFS)
    .join("text")
    .attr("class", "rowlabel")
    .attr("x", strip.left - 6)
    .attr("y", (d) => y(d[0] * k) + 4)
    .attr("text-anchor", "end")
    .text((d) => `${d[0]} Tu`)
    .append("title")
    .text((d) => `${d[0]} T_u nominal: ${d[1]}`);

  const sym = d3.symbol().size(46);
  svg
    .append("g")
    .selectAll("path")
    .data(d3.range(iv.length))
    .join("path")
    .attr("transform", (i) => `translate(${strip.x(i) + strip.gw / 2},${y(iv[i])})`)
    .attr("d", (i) => sym.type(nextCh[i] ? d3.symbolSquare : d3.symbolCircle)())
    .attr("fill", (i) => classColor(labels[i]))
    .attr("stroke", css("--surface"))
    .attr("stroke-width", 1.5);

  svg
    .append("g")
    .selectAll("rect")
    .data(d3.range(iv.length))
    .join("rect")
    .attr("x", (i) => strip.x(i))
    .attr("width", strip.gw)
    .attr("y", top)
    .attr("height", bottom - top)
    .attr("fill", "transparent")
    .style("cursor", "pointer")
    .on("click", (_, i) => onSelect(i))
    .on("mousemove", (ev: MouseEvent, i) =>
      showTip(
        ev,
        `<div class="t">Gap ${i}</div>interval ${iv[i].toFixed(2)} T̂u = ${((iv[i] * r.tu_us) / 1000).toFixed(0)} ms (${(iv[i] / k).toFixed(2)} nominal T<sub>u</sub>)<br>` +
          `next mark: ${nextCh[i] ? "dash" : "dot"}<br>true class: <b>${CLASS_NAMES[labels[i]]}</b>`,
      ),
    )
    .on("mouseleave", hideTip);

  svg
    .append("text")
    .attr("class", "muted")
    .attr("x", strip.left)
    .attr("y", H - 4)
    .text("gap →");
}
