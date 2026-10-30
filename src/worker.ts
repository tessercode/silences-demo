// Pyodide runs here, off the UI thread. Messages: {type: "init", bundle, pyodide} -> {type: "ready", meta};
// {type: "run", id, args} -> {type: "result", id, json} or {type: "error", id, message}.
// The site serves Pyodide itself (public/pyodide/, from tools/vendor_pyodide.mjs).

let run: ((kw: unknown) => string) | null = null;

async function init(bundleUrl: string, pyodideUrl: string) {
  const status = (text: string) => postMessage({ type: "status", text });
  status("Loading Python (Pyodide)…");
  const { loadPyodide } = await import(/* @vite-ignore */ pyodideUrl + "pyodide.mjs");
  const py = await loadPyodide({ indexURL: pyodideUrl });
  status("Loading numpy…");
  await py.loadPackage("numpy");
  status("Loading the trained segmenters…");
  const buf = await (await fetch(bundleUrl)).arrayBuffer();
  py.unpackArchive(new Uint8Array(buf), "tar", { extractDir: "/bundle" });
  py.runPython("import sys, json; sys.path.insert(0, '/bundle'); import demo_api");
  run = py.runPython("lambda kw: demo_api.run_json(**kw.to_py())");
  const meta = py.runPython("json.dumps(dict(fists=demo_api.fists(), fits=demo_api.fits()))");
  postMessage({ type: "ready", meta: JSON.parse(meta) });
}

onmessage = async (ev: MessageEvent) => {
  const m = ev.data;
  if (m.type === "init") {
    try {
      await init(m.bundle, m.pyodide);
    } catch (e) {
      postMessage({ type: "fatal", message: String(e) });
    }
  } else if (m.type === "run") {
    try {
      const t = performance.now();
      const json = run!(m.args);
      postMessage({ type: "result", id: m.id, json, ms: performance.now() - t });
    } catch (e) {
      postMessage({ type: "error", id: m.id, message: String(e) });
    }
  }
};
