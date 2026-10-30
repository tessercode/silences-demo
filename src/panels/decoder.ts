// Panel 6: the beam decoder. After every gap it keeps the 20 best hypotheses (text so far plus the
// letter still being keyed); a hypothesis may only close a letter on a complete Morse pattern, and
// closing one adds the character language model's log-probability plus the insertion bonus γ.
import { CLASS_NAMES, Result, classColor, el, q } from "../common";

/** (emitted text, letter in progress) of the winning hypothesis after every gap. */
function winningStates(r: Result): string[] {
  const inv: Record<string, string> = Object.fromEntries(Object.entries(r.morse as Record<string, string>).map(([k, v]) => [v, k]));
  const ch: string[] = r.marks.map((m: number[]) => (m[1] ? "-" : "."));
  const seg: number[] = r.seg ?? [];
  let emitted = "";
  let cur = ch[0];
  const out: string[] = [];
  seg.forEach((k, i) => {
    const c = ch[i + 1];
    if (k === 0) cur += c;
    else {
      emitted += inv[cur] + (k === 2 ? " " : "");
      cur = c;
    }
    out.push(`${emitted}|${cur}`);
  });
  return out;
}

export function renderDecoder(box: HTMLElement, r: Result, selected: number, onSelect: (g: number) => void, showAll: boolean) {
  box.replaceChildren();
  if (r.beam_died) {
    box.append(el("p", { class: "error" }, "No hypothesis survived: the beam died. The decoder outputs nothing for this transmission."));
  }
  const parts = r.score_parts;
  if (parts) {
    const tot = q(r.final_score_q16);
    box.append(
      el(
        "div",
        { class: "tiles" },
        tile("winning score", tot.toFixed(1)),
        tile("segmenter: Σ T·log p", q(parts.segmenter).toFixed(1)),
        tile("char-LM: Σ log P", q(parts.lm).toFixed(1)),
        tile("insertion bonus: γ × letters", "+" + q(parts.gamma).toFixed(1)),
      ),
    );
  }
  const steps: [string, string, number, number][][] = r.beam;
  const win = winningStates(r);
  const K = showAll ? 20 : 6;
  const lattice = el("div", { class: "lattice" });
  steps.forEach((beam, i) => {
    const col = el("div", { class: "lcol" + (i === selected ? " sel" : "") });
    const head = el("div", { class: "lh" }, `gap ${i}`);
    if (r.seg) head.style.borderBottomColor = classColor(r.seg[i]);
    head.title = r.seg ? `winning path: ${CLASS_NAMES[r.seg[i]]}` : "";
    head.onclick = () => onSelect(i);
    col.append(head);
    const best = beam.length ? beam[0][2] : 0;
    beam.slice(0, K).forEach(([emitted, cur, score, last]) => {
      const isWin = win[i] === `${emitted}|${cur}`;
      const tail = emitted.length > 7 ? "…" + emitted.slice(-7) : emitted;
      const cell = el(
        "div",
        { class: "lcell" + (isWin ? " win" : "") },
        el("span", { class: "sc" }, i === 0 && score === best ? "0" : q(score - best).toFixed(1)),
        tail.replace(/ /g, "␣"),
        el("span", { class: "pat" }, cur),
      );
      cell.title = `${emitted.replace(/ /g, "␣")}[${cur}]  — last gap read as ${CLASS_NAMES[last]}; score ${q(score).toFixed(2)} (${q(score - best).toFixed(2)} vs best)`;
      col.append(cell);
    });
    lattice.append(col);
  });
  const scroller = el("div", { class: "hscroll" }, lattice);
  box.append(scroller);
  requestAnimationFrame(() => {
    const target = lattice.children[selected] as HTMLElement | undefined;
    if (target) scroller.scrollLeft = target.offsetLeft - scroller.clientWidth / 2 + 46;
  });
}

function tile(k: string, v: string) {
  return el("div", { class: "tile" }, el("div", { class: "k" }, k), el("div", { class: "v" }, v));
}
