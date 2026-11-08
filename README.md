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
| `tools/build_bundle.py` | packs the package, deployed models, char-LM, fists and fitted decoder weights into `public/silences_bundle.tar` |
| `tests/` | the bridge against the release: chain goldens bit-exact for all three segmenters; traces equal the untraced code |
| `src/about.ts` | citations and links for the footer (release day fills the DOIs; see `RELEASING.md`) |
| `public/THIRD_PARTY_NOTICES.txt` | what the site serves under other licences |
| `tools/pyodide_parity.mjs` | re-runs 100 cases in Pyodide (Node) and compares them with CPython |
| `tools/browser_parity.mjs` | the same 100 cases in a headless browser (`--browser=chromium`, `firefox` or `webkit`), through the bundle the app loads |
| `tools/clip_check.mjs` | every view at desktop and phone widths: no chart text clipped, no sideways scrolling |
| `.github/workflows/ci.yml` | all of the above on every push; publishes to GitHub Pages once the repository is public |
| `docs/copy.md` | every piece of explanatory text on the page, numbered for review |
| `RELEASING.md` | the steps for going public with the silences release |
| `src/` | the page: `worker.ts` (Pyodide off the UI thread), `main.ts` (controls), `panels/` (one per module) |

## Run locally

```bash
git submodule update --init
npm install
python3 tools/build_bundle.py           # a Python with numpy; writes public/silences_bundle.tar
node tools/vendor_pyodide.mjs           # Pyodide + numpy into public/pyodide/
npm run dev                             # http://localhost:5173
npm run build                           # static site in dist/
```

## Serve for testing on a local network

```bash
tools/serve.sh            # http://<this machine>:8080/ ; tools/serve.sh <port> <host> to change
```

The script builds everything and serves the static site with `vite preview`. The first run also
creates `.venv` (numpy, to build the model bundle) and installs `node_modules`. The site serves Pyodide
and numpy itself (`tools/vendor_pyodide.mjs` copies them into `public/pyodide/`, checking the wheel
against Pyodide's lock file), so testers' browsers need to reach only this machine. It has no access
control: anyone who can reach the port can use it.

To keep it running across reboots, as a systemd user service:

```bash
mkdir -p ~/.config/systemd/user && cp deploy/silences-demo.service ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now silences-demo
journalctl --user -u silences-demo -f
```

The unit assumes the checkout is at `~/workspace/silences-demo`; edit `WorkingDirectory` and
`ExecStart` otherwise. It starts without a login session only if lingering is on
(`loginctl enable-linger $USER`). After pulling changes, `systemctl --user restart silences-demo`
rebuilds and serves the new version.

## Checks

```bash
git submodule update --init
python3 -m pytest tests                 # needs numpy and scipy
python3 tools/build_bundle.py
python3 tools/parity_cases.py           # only when the bridge changes
npm install && npm run parity
npx playwright install chromium && node tools/browser_parity.mjs http://localhost:8080/   # with tools/serve.sh running
```

Decoder weights: by default each segmenter decodes at its own (T, γ) fitted on English words
(`records/decoder_weights/fit.json` in the release); the random-letter fit and the deployed (1, 2.5)
are selectable. The oracle has no fit and decodes at the deployed weights.

MIT licensed, as is the silences release.
