// Panel 7: decoded text against what was sent, and the error rates.
import { Result, SEGMENTER_NAMES, alignChars, el, pct } from "../common";

export function diffLines(truth: string, decoded: string | null): HTMLElement {
  const ops = alignChars(truth, decoded ?? "");
  const top = el("div", { class: "line" }, el("span", { class: "lab" }, "sent"));
  const bot = el("div", { class: "line" }, el("span", { class: "lab" }, "decoded"));
  const a = el("span");
  const b = el("span");
  for (const [op, t, d] of ops) {
    const cls = op === "=" ? "c" : op === "~" ? "c sub-op" : op === "-" ? "c del-op" : "c ins-op";
    a.append(el("span", { class: cls }, t === " " ? " " : t || " "));
    b.append(el("span", { class: cls }, d === " " ? " " : d || " "));
  }
  top.append(a);
  bot.append(b);
  return el("div", { class: "diff" }, top, bot);
}

export function renderOutput(box: HTMLElement, r: Result) {
  box.replaceChildren();
  box.append(diffLines(r.truth, r.decoded_text));
  const tiles = el(
    "div",
    { class: "tiles" },
    tile("CER", pct(r.cer), `${r.edits.char} char edits / ${r.edits.chars}`),
    tile("WER", pct(r.wer), `${r.edits.word} word edits / ${r.edits.words}`),
    tile("gap accuracy (argmax)", pct(r.gap_accuracy), `${r.gap_errors.length} of ${r.labels.length} gaps wrong`),
    tile("gaps the beam got wrong", `${r.seg_errors.length}`, "after the language model"),
    tile("time in the browser", `${r.timing_ms.total.toFixed(0)} ms`, `chain ${r.timing_ms.chain.toFixed(0)} · beam ${r.timing_ms.decode.toFixed(0)}`),
  );
  box.append(tiles);
  if (r.decoded_deployed !== r.decoded_text && r.weights.source !== "deployed") {
    box.append(el("p", { class: "note" }, `At the deployed decoder weights (T = 1, γ = 2.5) this would read: `, el("span", { class: "mono" }, r.decoded_deployed ?? "(nothing)")));
  }
}

function tile(k: string, v: string, s: string) {
  return el("div", { class: "tile" }, el("div", { class: "k" }, k), el("div", { class: "v" }, v), el("div", { class: "sub" }, s));
}

export function renderCompareTable(box: HTMLElement, results: Result[], onOpen: (seg: string) => void) {
  const head = el("tr", {}, ...["Segmenter", "Decoder weights", "Decoded vs sent", "CER", "WER", "Gap acc.", "ms"].map((h) => el("th", {}, h)));
  const rows = results.map((r) => {
    const tr = el(
      "tr",
      { class: "clickable", title: "Open this segmenter" },
      el("td", {}, el("b", {}, SEGMENTER_NAMES[r.segmenter])),
      el("td", { class: "sub" }, `T = ${r.weights.T}, γ = ${r.weights.gamma}`),
      el("td", {}, diffLines(r.truth, r.decoded_text)),
      el("td", { class: "num" }, pct(r.cer)),
      el("td", { class: "num" }, pct(r.wer)),
      el("td", { class: "num" }, pct(r.gap_accuracy)),
      el("td", { class: "num" }, r.timing_ms.total.toFixed(0)),
    );
    tr.onclick = () => onOpen(r.segmenter);
    return tr;
  });
  box.replaceChildren(el("div", { class: "hscroll" }, el("table", { class: "compare" }, el("thead", {}, head), el("tbody", {}, ...rows))));
}
