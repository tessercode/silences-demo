// Panel 4: what the segmenter reads. LIF and MLP read a window of 21 gaps around the gap being
// classified: the log of each interval in T̂u and the channel bit of the mark that ends it,
// standardised. The BiGRU reads nine features per gap, one gap at a time, in both directions.
import * as d3 from "d3";
import { GapStrip, Result, css, diverging, hideTip, sequential, showTip, svgIn } from "../common";

export function renderWindow(box: HTMLElement, r: Result, gap: number) {
  const W: number = r.features.W;
  const row: number[] = r.features.standardized[gap];
  const n = 2 * W + 1;
  const cell = Math.max(16, Math.min(30, Math.floor((box.clientWidth - 150) / n)));
  const left = 140;
  const H = 24 + 2 * cell + 40;
  const svg = svgIn(box, left + n * cell + 8, H);
  const color = diverging(3);
  const names = ["log(interval / T̂u)", "channel bit (dash = 1)"];
  for (let k = 0; k < 2; k++) {
    svg
      .append("text")
      .attr("class", "rowlabel")
      .attr("x", left - 8)
      .attr("y", 24 + k * cell + cell / 2 + 4)
      .attr("text-anchor", "end")
      .text(names[k]);
    svg
      .append("g")
      .selectAll("rect")
      .data(d3.range(n))
      .join("rect")
      .attr("x", (c) => left + c * cell + 1)
      .attr("y", 24 + k * cell + 1)
      .attr("width", cell - 2)
      .attr("height", cell - 2)
      .attr("rx", 3)
      .attr("fill", (c) => color(row[k * n + c]))
      .on("mousemove", (ev: MouseEvent, c) => {
        const g = gap + c - W;
        const inside = g >= 0 && g < r.interval_tu.length;
        const raw = !inside
          ? "padding (outside the transmission)"
          : k === 0
            ? `interval ${r.interval_tu[g].toFixed(2)} T̂u`
            : `next mark: ${r.marks[g + 1][1] ? "dash" : "dot"}`;
        showTip(ev, `<div class="t">Gap ${inside ? g : "–"} (offset ${c - W >= 0 ? "+" : ""}${c - W})</div>${raw}<br>standardised input ${row[k * n + c].toFixed(2)}`);
      })
      .on("mouseleave", hideTip);
  }
  svg
    .append("rect")
    .attr("x", left + W * cell)
    .attr("y", 22)
    .attr("width", cell)
    .attr("height", 2 * cell + 4)
    .attr("rx", 4)
    .attr("fill", "none")
    .attr("stroke", css("--ink"))
    .attr("stroke-width", 2);
  svg
    .append("g")
    .selectAll("text")
    .data(d3.range(n).filter((c) => (c - W) % 5 === 0))
    .join("text")
    .attr("x", (c) => left + c * cell + cell / 2)
    .attr("y", 14)
    .attr("text-anchor", "middle")
    .text((c) => (c === W ? `gap ${gap}` : `${c - W > 0 ? "+" : ""}${c - W}`));
  legendDiverging(svg, left, H - 26, "standardised value", 3);
}

export function renderGap9(box: HTMLElement, r: Result, strip: GapStrip, selected: number, onSelect: (g: number) => void) {
  const rows: number[][] = r.features.rows;
  const names: string[] = ["ISI trace 1", "ISI trace 2", "ISI trace 3", "ISI trace 4", "ISI trace 5", "ISI trace 6", "next is dash", "past 3.5 Tu", "past dot/dash Tu"];
  const ch = 12;
  const H = 9 * ch + 18;
  const svg = svgIn(box, strip.width, H);
  const color = sequential(0, 1);
  for (let k = 0; k < 9; k++) {
    svg
      .append("text")
      .attr("class", "rowlabel")
      .attr("x", strip.left - 6)
      .attr("y", k * ch + ch - 2)
      .attr("text-anchor", "end")
      .style("font-size", "10px")
      .text(names[k]);
    svg
      .append("g")
      .selectAll("rect")
      .data(d3.range(rows.length))
      .join("rect")
      .attr("x", (i) => strip.x(i))
      .attr("y", k * ch)
      .attr("width", strip.gw - (strip.gw > 6 ? 1 : 0))
      .attr("height", ch - 1)
      .attr("fill", (i) => color(rows[i][k]));
  }
  svg
    .append("rect")
    .attr("x", strip.x(selected))
    .attr("y", -1)
    .attr("width", strip.gw)
    .attr("height", 9 * ch + 1)
    .attr("fill", "none")
    .attr("stroke", css("--ink"))
    .attr("stroke-width", 1.5);
  svg
    .append("g")
    .selectAll("rect")
    .data(d3.range(rows.length))
    .join("rect")
    .attr("x", (i) => strip.x(i))
    .attr("width", strip.gw)
    .attr("height", 9 * ch)
    .attr("fill", "transparent")
    .style("cursor", "pointer")
    .on("click", (_, i) => onSelect(i))
    .on("mousemove", (ev: MouseEvent, i) =>
      showTip(ev, `<div class="t">Gap ${i}</div>` + names.map((nm, k) => `${nm}: ${rows[i][k].toFixed(3)}`).join("<br>")),
    )
    .on("mouseleave", hideTip);
}

export function legendDiverging(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, x: number, y: number, label: string, m: number) {
  const color = diverging(m);
  const g = svg.append("g").attr("transform", `translate(${x},${y})`);
  const w = 120;
  const id = `grad-${Math.random().toString(36).slice(2)}`;
  const grad = g.append("defs").append("linearGradient").attr("id", id);
  [-m, 0, m].forEach((v, i) => grad.append("stop").attr("offset", `${i * 50}%`).attr("stop-color", color(v)));
  g.append("rect").attr("width", w).attr("height", 8).attr("rx", 2).attr("fill", `url(#${id})`);
  g.append("text").attr("x", 0).attr("y", 20).attr("class", "muted").text(`−${m}`);
  g.append("text").attr("x", w / 2).attr("y", 20).attr("class", "muted").attr("text-anchor", "middle").text("0");
  g.append("text").attr("x", w).attr("y", 20).attr("class", "muted").attr("text-anchor", "end").text(`+${m}`);
  g.append("text").attr("x", w + 10).attr("y", 8).attr("class", "muted").text(label);
}
