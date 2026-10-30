// The parity cases (tools/parity_expected.json) run in headless Chromium against the dev or preview
// server, through the same Pyodide build and bundle the app loads. Usage: node tools/browser_parity.mjs <url>
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const root = new URL("..", import.meta.url).pathname;
const url = process.argv[2] ?? "http://localhost:5179/";
const cases = JSON.parse(readFileSync(root + "tools/parity_expected.json", "utf8"));
const digestSrc = readFileSync(root + "tools/parity_cases.py", "utf8").split("\ndef cases")[0]
  .replace(/^REPO = .*$/m, "").replace(/^sys\.path.*$/m, "");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url);
const got = await page.evaluate(async ({ cases, digestSrc }) => {
  const base = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
  const { loadPyodide } = await import(base + "pyodide.mjs");
  const py = await loadPyodide({ indexURL: base });
  await py.loadPackage("numpy");
  const buf = await (await fetch(new URL("silences_bundle.tar", document.baseURI))).arrayBuffer();
  py.unpackArchive(new Uint8Array(buf), "tar", { extractDir: "/bundle" });
  py.runPython("import sys; sys.path.insert(0, '/bundle')");
  py.runPython(digestSrc);
  const run = py.runPython("lambda c: json.dumps(digest(d.run(**c.to_py())))");
  return cases.map(({ case: c }) => JSON.parse(run(c)));
}, { cases, digestSrc });
let bad = 0;
cases.forEach(({ case: c, expect }, i) => {
  if (JSON.stringify(got[i]) !== JSON.stringify(expect)) {
    bad++;
    console.log("MISMATCH", c, got[i], expect);
  }
});
console.log(`${cases.length - bad}/${cases.length} cases identical to CPython in Chromium`);
await browser.close();
process.exit(bad ? 1 : 0);
