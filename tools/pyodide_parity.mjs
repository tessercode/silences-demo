// Re-run tools/parity_expected.json's cases in Pyodide (Node) and compare with CPython; print timings.
import { readFileSync } from "node:fs";
import { loadPyodide } from "pyodide";

const root = new URL("..", import.meta.url).pathname;
const t0 = performance.now();
const py = await loadPyodide();
await py.loadPackage("numpy");
py.unpackArchive(new Uint8Array(readFileSync(root + "public/silences_bundle.tar")), "tar", { extractDir: "/bundle" });
py.runPython("import sys; sys.path.insert(0, '/bundle')");
py.runPython(readFileSync(root + "tools/parity_cases.py", "utf8").split("\ndef cases")[0].replace(/^REPO = .*$/m, "").replace(/^sys\.path.*$/m, ""));
console.log(`load ${((performance.now() - t0) / 1000).toFixed(1)} s`);

const runCase = py.runPython("lambda c: json.dumps(digest(d.run(**c)))");
const cases = JSON.parse(readFileSync(root + "tools/parity_expected.json", "utf8"));
let bad = 0;
const ms = {};
for (const { case: c, expect } of cases) {
  const t = performance.now();
  const got = JSON.parse(runCase(py.toPy(c)));
  (ms[c.segmenter] ??= []).push(performance.now() - t);
  if (JSON.stringify(got) !== JSON.stringify(expect)) {
    bad++;
    console.log("MISMATCH", c, "\n  got   ", got, "\n  expect", expect);
  }
}
for (const [s, v] of Object.entries(ms)) {
  v.sort((a, b) => a - b);
  console.log(`${s.padEnd(6)} median ${v[v.length >> 1].toFixed(0)} ms, max ${v[v.length - 1].toFixed(0)} ms`);
}
console.log(`${cases.length - bad}/${cases.length} cases identical to CPython`);
process.exit(bad ? 1 : 0);
