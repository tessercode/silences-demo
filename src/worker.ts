// Pyodide runs here, off the UI thread. Messages: {type: "init", bundle, pyodide} -> {type: "ready", meta};
// {type: "run", id, args} -> {type: "result", id, json} or {type: "error", id, message}.
// The site serves Pyodide itself (public/pyodide/, from tools/vendor_pyodide.mjs).

let run: ((kw: unknown) => string) | null = null;

async function init(bundleUrl: string, pyodideUrl: string) {
  const status = (text: string) => postMessage({ type: "status", text });
  // A first visit downloads about 17 MB (Python 14 MB, numpy 3 MB, models 1.4 MB); later visits come from the cache.
  status("Step 1 of 3: loading Python (Pyodide, about 14 MB on a first visit)…");
  const { loadPyodide } = await import(/* @vite-ignore */ pyodideUrl + "pyodide.mjs");
  const py = await loadPyodide({ indexURL: pyodideUrl });
  status("Step 2 of 3: loading numpy (3 MB)…");
  await py.loadPackage("numpy");
  status("Step 3 of 3: loading the trained segmenters and language model…");
  const buf = await fetchWithProgress(bundleUrl, (pct) => status(`Step 3 of 3: loading the trained segmenters and language model (${pct}%)…`));
  py.unpackArchive(buf, "tar", { extractDir: "/bundle" });
  py.runPython("import sys, json; sys.path.insert(0, '/bundle'); import demo_api");
  run = py.runPython("lambda kw: demo_api.run_json(**kw.to_py())");
  const meta = py.runPython("json.dumps(demo_api.meta())");
  postMessage({ type: "ready", meta: JSON.parse(meta) });
}

async function fetchWithProgress(url: string, progress: (pct: number) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  // content-length is the size on the wire, which a compressing server makes smaller than the tar.
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  const reader = res.body.getReader();
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    n += value.length;
    if (total) progress(Math.min(99, Math.round((100 * n) / total)));
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
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
