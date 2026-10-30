// The page controller: settings -> worker -> panels.
import { CLASS_NAMES, Result, SEGMENTER_NAMES, el, gapStrip, revealGap, syncGapScroll } from "./common";
import { renderDecoder } from "./panels/decoder";
import { renderEncoder } from "./panels/encoder";
import { renderGap9, renderWindow } from "./panels/features";
import { renderFrontEnd } from "./panels/frontend";
import { renderCompareTable, renderOutput } from "./panels/output";
import { renderBigruTrace, renderLifTrace, renderMlpTrace, renderPosteriors } from "./panels/segmenter";
import "./style.css";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const SAMPLES = [
  "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG",
  "PLAYING THE SILENCES",
  "CQ CQ DE W1AW K",
  "SPIKES KEEP TIME",
  "XQ JZVK PWLB",
];
const SEGMENTERS = ["lif", "mlp", "bigru", "oracle", "compare"];

interface Fist {
  name: string;
  number: number;
  wpm: number;
  r: number;
  sigma_elem: number;
  sigma_gap: number;
  omega: number;
}
interface Fit {
  T: number;
  gamma: number;
  cer: number;
  wer: number;
}
interface Meta {
  fists: Fist[];
  fits: Record<string, Record<string, Fit>>;
}

const state = {
  segmenter: "lif",
  gap: null as number | null,
  showAllBeam: false,
};
let meta: Meta;
let last: Result[] = [];

// ---- worker ----
const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
let nextId = 0;
const pending = new Map<number, (r: Result) => void>();
worker.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === "status") $("status-text").textContent = m.text;
  else if (m.type === "ready") onReady(m.meta);
  else if (m.type === "fatal") fail(`Could not start Python: ${m.message}`);
  else if (m.type === "result") pending.get(m.id)?.(JSON.parse(m.json));
  else if (m.type === "error") pending.get(m.id)?.({ error: m.message });
  if (m.id !== undefined) pending.delete(m.id);
};
worker.postMessage({ type: "init", bundle: new URL("silences_bundle.tar", document.baseURI).href });

function call(args: Record<string, unknown>): Promise<Result> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker.postMessage({ type: "run", id, args });
  });
}

function fail(msg: string) {
  $("status").classList.add("hidden");
  const e = $("error");
  e.textContent = msg;
  e.classList.remove("hidden");
}

// ---- controls ----
function onReady(m: Meta) {
  meta = m;
  const fistSel = $<HTMLSelectElement>("fist");
  for (const f of meta.fists) fistSel.append(el("option", { value: f.name }, `${f.name.replace(/_/g, " ")} (${f.wpm.toFixed(0)} WPM)`));
  fistSel.value = "cootie_corrected";
  for (const s of SAMPLES) {
    const b = el("button", {}, s);
    b.onclick = () => {
      $<HTMLTextAreaElement>("text").value = s;
      state.gap = null;
      go();
    };
    $("samples").append(b);
  }
  for (const s of SEGMENTERS) {
    const b = el("button", { "data-seg": s, "aria-pressed": String(s === state.segmenter) }, s === "compare" ? "Compare all" : SEGMENTER_NAMES[s].replace(" (5-seed)", "").replace(" gap labels", ""));
    b.onclick = () => setSegmenter(s);
    $("segmenter").append(b);
  }
  const legend = CLASS_NAMES.map((n, k) => el("span", {}, el("span", { class: "sw", style: `background: var(--class-${k})` }), n));
  $("legend-classes").append(...legend);
  $("legend-classes-2").append(...legend.map((n) => n.cloneNode(true)), el("span", {}, el("span", { class: "x" }, "×"), "argmax differs from the true class"));

  fistSel.onchange = () => go();
  $("weights").onchange = () => go();
  $("T").onchange = () => go();
  $("gamma").onchange = () => go();
  $("go").onclick = () => {
    state.gap = null;
    go();
  };
  $("reroll").onclick = () => {
    $<HTMLInputElement>("seed").value = String(1 + Math.floor(Math.random() * 99999));
    state.gap = null;
    go();
  };
  $("seed").onchange = () => {
    state.gap = null;
    go();
  };
  $("text").onkeydown = (ev: KeyboardEvent) => {
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      state.gap = null;
      go();
    }
  };
  $<HTMLInputElement>("beam-all").onchange = (ev) => {
    state.showAllBeam = (ev.target as HTMLInputElement).checked;
    if (last.length === 1) renderDecoder($("v-decoder"), last[0], selectedGap(last[0]), select, state.showAllBeam);
  };
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => last.length && render(last));
  let resize = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resize);
    resize = window.setTimeout(() => last.length && render(last), 200);
  });
  go();
}

function setSegmenter(s: string) {
  state.segmenter = s;
  for (const b of $("segmenter").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.seg === s));
  go();
}

function settings() {
  const f = meta.fists.find((x) => x.name === $<HTMLSelectElement>("fist").value)!;
  $("fist-params").innerHTML =
    `<b>${f.wpm.toFixed(1)}</b> WPM · dash/dot ratio <b>${f.r.toFixed(2)}</b> · element jitter <b>${f.sigma_elem.toFixed(2)}</b> T<sub>u</sub> · ` +
    `gap jitter <b>${f.sigma_gap.toFixed(2)}</b> T<sub>u</sub> · word-speed drift ω <b>${f.omega.toFixed(2)}</b>`;
  const weights = $<HTMLSelectElement>("weights").value;
  $("custom-weights").classList.toggle("hidden", weights !== "custom");
  const fits = meta.fits[weights];
  $("weights-note").innerHTML =
    weights === "custom"
      ? "T scales the segmenter's log-posteriors; γ is the bonus added for every letter. Raising T with γ fixed turns the language model down."
      : weights === "deployed"
        ? "The one setting the RP2040 decode board uses for every segmenter."
        : "Each segmenter decodes at its own (T, γ), fitted on a calibration corpus of this text type: " +
          ["lif", "mlp", "bigru"].map((s) => `${s.toUpperCase()} (${fits[s].T}, ${fits[s].gamma})`).join(", ") +
          ". Typed text is neither of the fitted text types; the oracle always uses the deployed weights.";
  return {
    text: $<HTMLTextAreaElement>("text").value,
    fist: f.name,
    seed: Math.max(1, Math.floor(+$<HTMLInputElement>("seed").value || 1)),
    weights,
    T: +$<HTMLInputElement>("T").value,
    gamma: +$<HTMLInputElement>("gamma").value,
  };
}

let generation = 0;
async function go() {
  const s = settings();
  const gen = ++generation;
  $("status").classList.remove("hidden");
  $("status-text").textContent = "Decoding…";
  $("error").classList.add("hidden");
  const segs = state.segmenter === "compare" ? ["lif", "mlp", "bigru", "oracle"] : [state.segmenter];
  const results: Result[] = [];
  for (const seg of segs) {
    const gap = state.segmenter === "compare" ? null : state.gap;
    results.push(await call({ ...s, segmenter: seg, ...(gap !== null ? { gap } : {}) }));
  }
  if (gen !== generation) return;
  $("status").classList.add("hidden");
  const err = results.find((r) => r.error);
  if (err) {
    fail(err.error.includes("Traceback") ? `Python error:\n${err.error}` : `Cannot decode: ${err.error}.`);
    $("pipeline").classList.add("hidden");
    return;
  }
  last = results;
  render(results);
}

function selectedGap(r: Result): number {
  if (state.gap !== null && state.gap < r.labels.length) return state.gap;
  return r.trace?.gap ?? r.gap_errors[0] ?? 0;
}

function select(g: number) {
  state.gap = g;
  // LIF and MLP traces are computed for one gap, so they need a fresh run; the rest is redrawn.
  if (last.length === 1 && (last[0].segmenter === "lif" || last[0].segmenter === "mlp")) go();
  else render(last);
}

// ---- rendering ----
function render(results: Result[]) {
  const r = results[0];
  const compare = results.length > 1;
  $("pipeline").classList.remove("hidden");
  const g = selectedGap(r);
  const avail = $("v-frontend").clientWidth || $("p-frontend").clientWidth - 34;
  const strip = gapStrip(r.labels.length, avail);

  const enc = renderEncoder($("v-encoder"), r);
  $("enc-sub").textContent = `${enc.nMarks} marks over ${enc.seconds.toFixed(1)} s · ${enc.channelErrors} channel error${enc.channelErrors === 1 ? "" : "s"}`;
  $("h-wave").textContent = `waveform: ${enc.nMarks} spikes on two lines`;

  renderFrontEnd($("v-frontend"), r, strip, g, select);
  $("fe-sub").textContent = `T̂u = ${(r.tu_us / 1000).toFixed(1)} ms (the fist's nominal T_u is ${(r.nominal_tu_us / 1000).toFixed(1)} ms; words drift around it)`;
  $("h-06").textContent = `0x06 frame: ${r.n_marks} mark times + channel bits, T̂u = ${r.tu_us} µs`;
  $("hex-06").textContent = r.hex_0x06;

  // Features (single segmenter only).
  $("p-features").classList.toggle("hidden", compare || r.segmenter === "oracle");
  $("hf-feat").classList.toggle("hidden", compare || r.segmenter === "oracle");
  if (!compare && r.features?.kind === "window") {
    $("feat-sub").textContent = `gap ${g}: 42 inputs`;
    $("feat-explain").innerHTML =
      "The LIF and MLP classify each gap from a window of the 10 gaps before it, the gap itself and the 10 after: the log of each " +
      "interval in T̂u and the channel bit of the mark that ends it, standardised. The bit is what separates the two readings of a " +
      "4 T<sub>u</sub> interval. Pick another gap in step 3 or 5 to move the window.";
    $("h-feat").textContent = "42 standardised inputs per gap";
    renderWindow($("v-features"), r, g);
  } else if (!compare && r.features?.kind === "gap9") {
    $("feat-sub").textContent = `${r.labels.length} gaps × 9 features`;
    $("feat-explain").innerHTML =
      "The BiGRU reads nine features per gap: six decaying traces of the interval (a population of leaky integrators at different " +
      "rates), the next mark's channel bit, and two soft thresholds. It reads them in order, forwards and backwards, so it sees the " +
      "whole transmission in both directions, which is why it cannot stream and cannot run on SpiNNaker.";
    $("h-feat").textContent = "9 features per gap, the whole sequence";
    renderGap9($("v-features"), r, strip, g, select);
  }

  // Segmenter.
  const post = $("v-posteriors");
  post.replaceChildren();
  $("trace-title").textContent = "";
  $("trace-explain").textContent = "";
  $("v-trace").replaceChildren();
  if (compare) {
    $("seg-sub").textContent = "all four on the same transmission";
    $("seg-explain").innerHTML = "Each row is one segmenter's posteriors for every gap of the same transmission. Click a row in the result table to open that segmenter.";
    for (const res of results) {
      post.append(el("div", { class: "sub", style: "margin-top: 8px" }, `${SEGMENTER_NAMES[res.segmenter]} · ${res.gap_errors.length} of ${res.labels.length} gaps wrong`));
      const box = el("div", { class: "gapscroll" });
      post.append(box);
      renderPosteriors(box, res, strip, g, select, res.segmenter.toUpperCase());
    }
  } else {
    $("seg-sub").textContent = `${SEGMENTER_NAMES[r.segmenter]} · ${r.gap_errors.length} of ${r.labels.length} gaps wrong (argmax)`;
    $("seg-explain").innerHTML = segExplain(r.segmenter);
    const box = el("div", { class: "gapscroll" });
    post.append(box);
    renderPosteriors(box, r, strip, g, select);
    renderTrace(r, strip, g);
  }
  $("h-03").textContent = `0x03 frame: ${r.n_gaps} rows of three log-posteriors (Q16.16 fixed point)`;
  $("hex-03").textContent = r.hex_0x03;
  $("hex-05").textContent = r.hex_0x05;

  // Decoder and output.
  $("p-decoder").classList.toggle("hidden", compare);
  if (compare) {
    $("out-sub").textContent = "the same transmission through each segmenter";
    renderCompareTable($("v-output"), results, (s) => setSegmenter(s));
  } else {
    $("dec-sub").textContent = `T = ${r.weights.T}, γ = ${r.weights.gamma} (${weightsName(r.weights.source)})`;
    renderDecoder($("v-decoder"), r, g, select, state.showAllBeam);
    $("out-sub").textContent = SEGMENTER_NAMES[r.segmenter];
    renderOutput($("v-output"), r);
  }
  syncGapScroll();
  revealGap(strip, g);
}

function renderTrace(r: Result, strip: ReturnType<typeof gapStrip>, g: number) {
  const box = $("v-trace");
  if (r.segmenter === "lif") {
    $("trace-title").textContent = `Inside the LIF network at gap ${g}`;
    $("trace-explain").innerHTML =
      "The 42 inputs drive the first layer as a constant current for 40 time steps. Each neuron's membrane leaks by β each step, " +
      "and when it crosses the threshold the neuron spikes and the threshold is subtracted. Spikes are the only thing the layers pass on. " +
      "Each dot below is one spike (one row per neuron); the readout neurons do not spike, and the mean of their membranes is the three logits.";
    renderLifTrace(box, r);
  } else if (r.segmenter === "mlp") {
    $("trace-title").textContent = `Inside the MLP at gap ${g}`;
    $("trace-explain").innerHTML =
      "The control network: the same inputs and layer sizes as the LIF (256 and 128 units), with tanh units in place of spiking neurons " +
      "and one pass instead of 40 time steps.";
    renderMlpTrace(box, r);
  } else if (r.segmenter === "bigru") {
    $("trace-title").textContent = "Inside the BiGRU (first of five ensemble members)";
    $("trace-explain").innerHTML =
      "Hidden states of the two GRU directions after each gap. The forward pass carries what came before, the reverse pass what comes " +
      "after; the classifier reads both. The deployed segmenter averages five such networks.";
    box.className = "gapscroll";
    renderBigruTrace(box, r, strip, g);
    return;
  }
  box.className = "hscroll";
}

function segExplain(seg: string): string {
  const base = "Each bar is one gap's three posteriors, stacked to 100%; the strip beneath shows the true class. ";
  if (seg === "oracle")
    return (
      base +
      "The oracle is not a network: it gives the true class almost all the probability, so the decoder's remaining errors come from " +
      "channel errors (a dot sent as a dash) that no gap segmenter can fix."
    );
  return base + "Click a gap to see it inside the network.";
}

function weightsName(src: string) {
  return src === "fit_eng" ? "fitted, English" : src === "fit_rand" ? "fitted, random letters" : src;
}
