// Panel 5: the segmenter's output, one row of three log-posteriors per gap (the 0x03 frame), and a
// look inside the network for the selected gap.
import * as d3 from "d3";
import { CLASS_NAMES, GapStrip, Result, classColor, css, diverging, hideTip, q, showTip, svgIn } from "../common";
import { legendDiverging } from "./features";

/** Stacked three-class posterior bars, the true class beneath, and a cross where the argmax is wrong. */
export function renderPosteriors(box: HTMLElement, r: Result, strip: GapStrip, selected: number, onSelect: (g: number) => void, label = "posterior") {
  const lp: number[][] = r.lp3_q16;
  const labels: number[] = r.labels;
  const errs = new Set<number>(r.gap_errors);
  const P = lp.map((row) => {
    const e = row.map((v) => Math.exp(q(v)));
    const s = e[0] + e[1] + e[2];
    return e.map((v) => v / s);
  });
  const barH = 64;
  const H = barH + 34;
  const svg = svgIn(box, strip.width, H);
  svg
    .append("rect")
    .attr("x", strip.x(selected))
    .attr("width", strip.gw)
    .attr("y", 0)
    .attr("height", H - 4)
    .attr("fill", css("--select"));
  const gap = strip.gw > 6 ? 1 : 0;
  for (let i = 0; i < P.length; i++) {
    let y0 = barH;
    for (let k = 0; k < 3; k++) {
      const h = P[i][k] * barH;
      if (h < 0.5) continue;
      svg
        .append("rect")
        .attr("x", strip.x(i) + gap)
        .attr("width", strip.gw - 2 * gap)
        .attr("y", y0 - h + (k ? 0.5 : 0))
        .attr("height", Math.max(0, h - (k ? 0.5 : 0)))
        .attr("fill", classColor(k));
      y0 -= h;
    }
  }
  svg
    .append("g")
    .selectAll("rect")
    .data(labels)
    .join("rect")
    .attr("x", (_, i) => strip.x(i) + gap)
    .attr("width", strip.gw - 2 * gap)
    .attr("y", barH + 6)
    .attr("height", 7)
    .attr("rx", 1.5)
    .attr("fill", (k) => classColor(k));
  svg
    .append("g")
    .selectAll("text")
    .data(Array.from(errs))
    .join("text")
    .attr("x", (i) => strip.x(i) + strip.gw / 2)
    .attr("y", barH + 28)
    .attr("text-anchor", "middle")
    .style("fill", css("--critical"))
    .style("font-weight", "700")
    .style("font-size", "12px")
    .text("×");
  svg
    .append("g")
    .selectAll("text")
    .data([
      [label, barH / 2],
      ["true class", barH + 12],
      ["wrong argmax", barH + 26],
    ] as [string, number][])
    .join("text")
    .attr("class", "rowlabel")
    .attr("x", strip.left - 6)
    .attr("y", (d) => d[1])
    .attr("text-anchor", "end")
    .text((d) => d[0]);
  svg
    .append("g")
    .selectAll("rect")
    .data(d3.range(P.length))
    .join("rect")
    .attr("x", (i) => strip.x(i))
    .attr("width", strip.gw)
    .attr("height", H - 4)
    .attr("fill", "transparent")
    .style("cursor", "pointer")
    .on("click", (_, i) => onSelect(i))
    .on("mousemove", (ev: MouseEvent, i) =>
      showTip(
        ev,
        `<div class="t">Gap ${i}${errs.has(i) ? ` <span style="color:${css("--critical")}">× wrong</span>` : ""}</div>` +
          CLASS_NAMES.map((n, k) => `${n}: <b>${(100 * P[i][k]).toFixed(1)}%</b> (log ${q(lp[i][k]).toFixed(2)})`).join("<br>") +
          `<br>true: ${CLASS_NAMES[labels[i]]}`,
      ),
    )
    .on("mouseleave", hideTip);
}

/** LIF: both hidden layers' spikes over the T presentation steps (for the spike-fed form, the input trains first), and the readout membranes. */
export function renderLifTrace(box: HTMLElement, r: Result) {
  const tr = r.trace;
  const T: number = tr.T;
  box.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "two-col";
  const rasterBox = document.createElement("div");
  const readBox = document.createElement("div");
  wrap.append(rasterBox, readBox);
  box.append(wrap);

  const cw = 7;
  const rh = 1.25;
  const left = 70;
  const sizes: number[] = tr.sizes;
  const names: string[] = tr.names ?? sizes.map((_, l) => `layer ${l + 1}`);
  const units: string[] = tr.units ?? sizes.map(() => "LIF");
  const H = 32 + sizes.reduce((a, n) => a + n * rh + 26, 0); // room for the "time step" label
  const svg = svgIn(rasterBox, left + T * cw + 10, H);
  let y0 = 16;
  sizes.forEach((n, l) => {
    const steps: number[][] = tr.spikes[l];
    const total = steps.reduce((a, s) => a + s.length, 0);
    svg.append("rect").attr("x", left).attr("y", y0).attr("width", T * cw).attr("height", n * rh).attr("fill", css("--page")).attr("stroke", css("--grid"));
    svg
      .append("text")
      .attr("class", "rowlabel")
      .attr("x", left - 6)
      .attr("y", y0 + 12)
      .attr("text-anchor", "end")
      .text(names[l]);
    svg
      .append("text")
      .attr("class", "muted")
      .attr("x", left - 6)
      .attr("y", y0 + 26)
      .attr("text-anchor", "end")
      .text(`${n} ${units[l]}`);
    svg
      .append("text")
      .attr("class", "muted")
      .attr("x", left - 6)
      .attr("y", y0 + 40)
      .attr("text-anchor", "end")
      .text(`${total} spikes`);
    const g = svg.append("g").attr("fill", css("--ink"));
    steps.forEach((idx, t) => idx.forEach((k) => g.append("rect").attr("x", left + t * cw + 1).attr("y", y0 + k * rh).attr("width", cw - 2).attr("height", rh)));
    y0 += n * rh + 26;
  });
  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${y0 - 22})`)
    .call(
      d3
        .axisBottom(d3.scaleLinear().domain([0, T]).range([left, left + T * cw]))
        .ticks(4)
        .tickSizeOuter(0),
    );
  svg
    .append("text")
    .attr("class", "muted")
    .attr("x", left + T * cw)
    .attr("y", y0 + 4)
    .attr("text-anchor", "end")
    .text("time step");

  // Readout membranes: the logits are their mean over the T steps.
  const ro: number[][] = tr.readout;
  const w = Math.max(260, Math.min(420, readBox.clientWidth || 360));
  const h = 220;
  const s2 = svgIn(readBox, w, h + 40);
  const x = d3.scaleLinear().domain([0, T - 1]).range([40, w - 10]);
  const ext = d3.extent(ro.flat()) as [number, number];
  const y = d3.scaleLinear().domain([Math.min(0, ext[0]), Math.max(0, ext[1])]).nice().range([h - 10, 20]);
  s2.append("g").attr("class", "axis").attr("transform", `translate(0,${h - 10})`).call(d3.axisBottom(x).ticks(4).tickSizeOuter(0));
  s2.append("g").attr("class", "axis").attr("transform", "translate(40,0)").call(d3.axisLeft(y).ticks(5).tickSizeOuter(0));
  s2.append("line").attr("x1", 40).attr("x2", w - 10).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", css("--axis"));
  const logits = tr.logits_q.map(q);
  for (let k = 0; k < 3; k++) {
    s2.append("path")
      .datum(ro.map((m) => m[k]))
      .attr("fill", "none")
      .attr("stroke", classColor(k))
      .attr("stroke-width", 2)
      .attr("d", d3.line<number>().x((_, t) => x(t)).y((v) => y(v)));
    s2.append("line")
      .attr("x1", 40)
      .attr("x2", w - 10)
      .attr("y1", y(logits[k]))
      .attr("y2", y(logits[k]))
      .attr("stroke", classColor(k))
      .attr("stroke-dasharray", "4 3")
      .attr("opacity", 0.8);
  }
  s2.append("text").attr("x", 40).attr("y", 13).style("font-weight", "600").text("readout membrane (not spiking)");
  s2.append("text").attr("class", "muted").attr("x", 40).attr("y", h + 18).text("dashed: mean over the steps = the class logit");
  s2.append("text").attr("class", "muted").attr("x", 40).attr("y", h + 34).text(`β = ${tr.beta.toFixed(2)}, threshold ${tr.threshold}, subtractive reset, T = ${T}`);
}

/** MLP: each hidden layer's tanh activations for the selected gap. */
export function renderMlpTrace(box: HTMLElement, r: Result) {
  const hidden: number[][] = r.trace.hidden;
  const cell = 9;
  const cols = 32;
  const left = 70;
  const H = hidden.reduce((a, h) => a + Math.ceil(h.length / cols) * cell + 22, 10) + 30;
  const svg = svgIn(box, left + cols * cell + 10, H);
  const color = diverging(1);
  let y0 = 10;
  hidden.forEach((h, l) => {
    svg.append("text").attr("class", "rowlabel").attr("x", left - 6).attr("y", y0 + 10).attr("text-anchor", "end").text(`layer ${l + 1}`);
    svg.append("text").attr("class", "muted").attr("x", left - 6).attr("y", y0 + 24).attr("text-anchor", "end").text(`${h.length} tanh`);
    svg
      .append("g")
      .selectAll("rect")
      .data(h)
      .join("rect")
      .attr("x", (_, i) => left + (i % cols) * cell)
      .attr("y", (_, i) => y0 + Math.floor(i / cols) * cell)
      .attr("width", cell - 1)
      .attr("height", cell - 1)
      .attr("fill", (v) => color(v))
      .on("mousemove", (ev: MouseEvent, v) => showTip(ev, `activation ${v.toFixed(3)}`))
      .on("mouseleave", hideTip);
    y0 += Math.ceil(h.length / cols) * cell + 22;
  });
  legendDiverging(svg, left, y0, "activation", 1);
}

/** BiGRU: the first ensemble member's forward and reverse hidden states across the transmission. */
export function renderBigruTrace(box: HTMLElement, r: Result, strip: GapStrip, selected: number) {
  const dirs: [string, number[][]][] = [
    ["forward", r.trace.fwd],
    ["reverse", r.trace.rev],
  ];
  const rh = 2.5;
  const nH = r.trace.fwd[0]?.length ?? 32;
  const H = dirs.length * (nH * rh + 10) + 30;
  const svg = svgIn(box, strip.width, H);
  const color = diverging(1);
  dirs.forEach(([name, states], d) => {
    const y0 = d * (nH * rh + 10);
    svg.append("text").attr("class", "rowlabel").attr("x", strip.left - 6).attr("y", y0 + 14).attr("text-anchor", "end").text(name);
    svg.append("text").attr("class", "muted").attr("x", strip.left - 6).attr("y", y0 + 28).attr("text-anchor", "end").text(`${nH} units`);
    const g = svg.append("g");
    states.forEach((h, i) =>
      h.forEach((v, k) =>
        g.append("rect").attr("x", strip.x(i)).attr("y", y0 + k * rh).attr("width", strip.gw).attr("height", rh).attr("fill", color(v)),
      ),
    );
  });
  svg
    .append("rect")
    .attr("x", strip.x(selected))
    .attr("y", -1)
    .attr("width", strip.gw)
    .attr("height", dirs.length * (nH * rh + 10) - 8)
    .attr("fill", "none")
    .attr("stroke", css("--ink"))
    .attr("stroke-width", 1.5);
  legendDiverging(svg, strip.left, H - 26, "hidden state", 1);
}
