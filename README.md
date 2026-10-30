# silences-demo

An in-browser demo of the *Playing the Silences* Morse pipeline: type text, choose an operator fist and a
gap segmenter (feedforward LIF, tanh MLP, BiGRU, or oracle gap labels), and follow what passes between
the encoder, front end, segmenter and beam decoder.

The pipeline is not reimplemented. The [silences](https://github.com/tessercode/silences) release is a
submodule (`vendor/silences`, pinned), and its Python runs unchanged in the browser under
[Pyodide](https://pyodide.org). `py/demo_api.py` is a thin bridge that calls the release's chain
(`silences.pipeline.compose`, the boards' Q16.16 arithmetic) and records what the views need.

## Layout

| Path | What |
|---|---|
| `py/demo_api.py` | `run(text, fist, seed, segmenter, weights)`: every intermediate as JSON |
| `tools/build_bundle.py` | packs the package, committed models, char-LM, fists and fitted decoder weights into `public/silences_bundle.tar` |
| `tests/` | the bridge against the release: chain goldens bit-exact for all three segmenters; traces equal the untraced code |
| `tools/pyodide_parity.mjs` | re-runs 100 cases in Pyodide (Node) and compares them with CPython |
| `tools/browser_parity.mjs` | the same 100 cases in headless Chromium, through the bundle the app loads |
| `src/` | the page: `worker.ts` (Pyodide off the UI thread), `main.ts` (controls), `panels/` (one per module) |

## Run locally

```bash
git submodule update --init
npm install
python3 tools/build_bundle.py           # a Python with numpy; writes public/silences_bundle.tar
npm run dev                             # http://localhost:5173
npm run build                           # static site in dist/
```

Pyodide and numpy load from the jsDelivr CDN (pinned to Pyodide 314.0.7); everything else is served
by the site.

## Checks

```bash
git submodule update --init
python3 -m pytest tests                 # needs numpy and scipy
python3 tools/build_bundle.py
python3 tools/parity_cases.py           # only when the bridge changes
npm install && npm run parity
npx playwright install chromium && node tools/browser_parity.mjs http://localhost:5173/   # with npm run dev
```

Decoder weights: by default each segmenter decodes at its own (T, γ) fitted on English words
(`records/decoder_weights/fit.json` in the release); the random-letter fit and the deployed (1, 2.5)
are selectable. The oracle has no fit and decodes at the deployed weights.

MIT licensed, as is the silences release.
