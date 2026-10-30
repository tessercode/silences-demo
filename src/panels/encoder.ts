// Panel 2: what the encoder sends. Each mark ends with a 1 ms spike on the dot or dash line; the
// row above shows where the same text would land with perfect timing (no jitter, no drift).
import * as d3 from "d3";
import { Result, css, hideTip, intendedChannels, showTip, svgIn } from "../common";

export function renderEncoder(box: HTMLElement, r: Result) {
  const wave: [number, number, number][] = r.waveform_us;
  const ideal: number[] = r.ideal_ticks_us;
  const letters = (r.text_clean as string).replace(/ /g, "");
  const intended = intendedChannels(r);
  const t0 = wave[0][0] - 300_000;
  const tEnd = Math.max(wave[wave.length - 1][1], ideal[ideal.length - 1]) + 300_000;
  const left = 92;
  const width = Math.max(box.clientWidth, left + wave.length * 11);
  const H = 190;
  const x = d3.scaleLinear().domain([t0, tEnd]).range([left, width - 8]);
  const svg = svgIn(box, width, H);
  const Y = { letter: 16, morse: 32, ideal: 66, dot: 108, dash: 144 };

  // Words as alternating bands over their actual span.
  const words = d3.groups(d3.range(wave.length), (j) => r.word_of_mark[j]);
  svg
    .append("g")
    .selectAll("rect")
    .data(words)
    .join("rect")
    .attr("x", ([, js]) => x(wave[js[0]][0]) - 6)
    .attr("width", ([, js]) => x(wave[js[js.length - 1]][1]) - x(wave[js[0]][0]) + 12)
    .attr("y", 4)
    .attr("height", H - 32)
    .attr("rx", 4)
    .attr("fill", css("--grid"))
    .attr("opacity", ([w]) => ((w as number) % 2 ? 0.35 : 0.7));

  // Row labels and baselines.
  const rows: [string, number][] = [
    ["letter", Y.letter],
    ["Morse", Y.morse],
    ["ideal timing", Y.ideal],
    ["dot line", Y.dot],
    ["dash line", Y.dash],
  ];
  svg
    .append("g")
    .selectAll("text")
    .data(rows)
    .join("text")
    .attr("class", "rowlabel")
    .attr("x", 0)
    .attr("y", (d) => d[1] + 4)
    .text((d) => d[0]);
  svg
    .append("g")
    .selectAll("line")
    .data([Y.ideal, Y.dot, Y.dash])
    .join("line")
    .attr("x1", left)
    .attr("x2", width - 8)
    .attr("y1", (d) => d)
    .attr("y2", (d) => d)
    .attr("stroke", css("--axis"));

  // Letters and their Morse, centred over the letter's marks.
  const byLetter = d3.groups(d3.range(wave.length), (j) => r.letter_of_mark[j]);
  const lg = svg.append("g").selectAll("g").data(byLetter).join("g");
  const cx = ([, js]: [unknown, number[]]) => (x(wave[js[0]][0]) + x(wave[js[js.length - 1]][0])) / 2;
  lg.append("text")
    .attr("x", cx)
    .attr("y", Y.letter + 4)
    .attr("text-anchor", "middle")
    .style("font-weight", "600")
    .style("fill", css("--ink"))
    .style("font-size", "13px")
    .text(([l]) => letters[l as number]);
  lg.append("text")
    .attr("x", cx)
    .attr("y", Y.morse + 4)
    .attr("text-anchor", "middle")
    .attr("class", "mono")
    .style("font-size", "11px")
    .text(([l]) => r.morse[letters[l as number]]);

  // Ideal completion times (same clock as the fist's), each tied to where the fist actually completed that mark.
  svg
    .append("g")
    .selectAll("line")
    .data(d3.range(wave.length))
    .join("line")
    .attr("x1", (j) => x(ideal[j]))
    .attr("y1", Y.ideal + 6)
    .attr("x2", (j) => x(wave[j][0]))
    .attr("y2", (j) => (wave[j][2] ? Y.dash : Y.dot) - 9)
    .attr("stroke", css("--axis"))
    .attr("stroke-width", 1);
  svg
    .append("g")
    .selectAll("line")
    .data(d3.range(wave.length))
    .join("line")
    .attr("x1", (j) => x(ideal[j]))
    .attr("x2", (j) => x(ideal[j]))
    .attr("y1", Y.ideal - 6)
    .attr("y2", Y.ideal + 6)
    .attr("stroke", css("--muted"))
    .attr("stroke-width", 2)
    .attr("stroke-linecap", "round");

  // The spikes, with channel errors ringed.
  const spikes = svg.append("g").selectAll("g").data(d3.range(wave.length)).join("g");
  spikes
    .filter((j) => wave[j][2] !== intended[j])
    .append("circle")
    .attr("cx", (j) => x(wave[j][0]))
    .attr("cy", (j) => (wave[j][2] ? Y.dash : Y.dot))
    .attr("r", 9)
    .attr("fill", "none")
    .attr("stroke", css("--critical"))
    .attr("stroke-width", 2);
  spikes
    .append("line")
    .attr("x1", (j) => x(wave[j][0]))
    .attr("x2", (j) => x(wave[j][0]))
    .attr("y1", (j) => (wave[j][2] ? Y.dash : Y.dot) - 9)
    .attr("y2", (j) => (wave[j][2] ? Y.dash : Y.dot))
    .attr("stroke", css("--ink"))
    .attr("stroke-width", 2)
    .attr("stroke-linecap", "round");
  spikes
    .append("rect")
    .attr("x", (j) => x(wave[j][0]) - 6)
    .attr("y", Y.dot - 16)
    .attr("width", 12)
    .attr("height", Y.dash - Y.dot + 24)
    .attr("fill", "transparent")
    .on("mousemove", (ev: MouseEvent, j) => {
      const l = letters[r.letter_of_mark[j]];
      const err = wave[j][2] !== intended[j];
      showTip(
        ev,
        `<div class="t">Mark ${j + 1}: letter ${l} (${r.morse[l]})</div>` +
          `completed at ${((wave[j][0] - wave[0][0]) / 1e6).toFixed(3)} s<br>` +
          `sent as a <b>${wave[j][2] ? "dash" : "dot"}</b>` +
          (err
            ? `<br><span style="color:${css("--critical")}">intended a ${intended[j] ? "dash" : "dot"}: the mark was held ${
                intended[j] ? "shorter" : "longer"
              } than 1.92 T<sub>u</sub>, so it lands on the wrong line</span>`
            : ""),
      );
    })
    .on("mouseleave", hideTip);

  // Time axis, in round seconds from the first mark.
  const seconds = d3.ticks(0, (tEnd - wave[0][0]) / 1e6, Math.max(2, Math.floor(width / 120)));
  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${H - 26})`) // room below for the tick labels
    .call(
      d3
        .axisBottom(x)
        .tickValues(seconds.map((s) => wave[0][0] + s * 1e6))
        .tickFormat((t) => `${d3.format("~f")((+t - wave[0][0]) / 1e6)} s`)
        .tickSizeOuter(0),
    );

  const errs = wave.filter((w, j) => w[2] !== intended[j]).length;
  return { channelErrors: errs, nMarks: wave.length, seconds: (wave[wave.length - 1][1] - wave[0][0]) / 1e6 };
}
