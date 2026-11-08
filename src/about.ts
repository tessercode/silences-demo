// Citations and links for the footer, in one place. Release day fills the two nulls (RELEASING.md).

export const ABOUT = {
  paper: {
    authors: "L. S. Hindman and K. D. Cantley",
    title: "Playing the Silences: A Feedforward Spiking Gap Detector for Word-Level Decoding of TEMPO Morse",
    venue: "submitted" as string, // the journal, once accepted
    doi: null as string | null,
  },
  release: {
    repo: "https://github.com/tessercode/silences",
    doi: "10.5281/zenodo.24057032" as string | null, // the Zenodo version DOI of the release this demo pins (v1.1.0)
  },
  tempo: {
    authors: "L. S. Hindman and K. D. Cantley",
    title: "TEMPO: A Stochastic Benchmarking Protocol for Evaluating Temporal Robustness in Spiking Neural Networks",
    venue: "Neuromorphic Computing and Engineering 6(3) 034002 (2026)",
    doi: "10.1088/2634-4386/ae84f7",
  },
  demoRepo: "https://github.com/tessercode/silences-demo",
};

declare const __SILENCES_COMMIT__: string; // vite.config.ts

const doiLink = (doi: string) => `<a href="https://doi.org/${doi}">doi:${doi}</a>`;

export function renderFooter(box: HTMLElement) {
  const { paper, release, tempo, demoRepo } = ABOUT;
  const pinned = __SILENCES_COMMIT__;
  box.innerHTML = `
    <p>Numbers here are for one sentence; the paper's results are averaged over thousands of transmissions and ten
      training seeds. Everything runs in your browser: nothing you type is sent anywhere.</p>
    <p><b>Paper.</b> ${paper.authors}, “${paper.title},” ${paper.doi ? doiLink(paper.doi) : paper.venue}.</p>
    <p><b>Code and models.</b> The <a href="${release.repo}">silences release</a>${release.doi ? ` (${doiLink(release.doi)})` : ""},
      at <a class="mono" href="${release.repo}/tree/${pinned}">${pinned}</a>, run unchanged under Pyodide.
      <a href="${demoRepo}">Source for this page</a> · <a href="THIRD_PARTY_NOTICES.txt">third-party notices</a>.</p>
    <p><b>Benchmark.</b> ${tempo.authors}, “${tempo.title},” ${tempo.venue}, ${doiLink(tempo.doi)}.</p>`;
}
