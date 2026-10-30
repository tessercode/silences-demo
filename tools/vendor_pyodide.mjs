// Copy the Pyodide runtime and the numpy wheel into public/pyodide/, so the site serves Python itself
// and testers' browsers never reach a CDN. The wheel comes from node_modules/pyodide when it is cached
// there (the Node parity run caches it), else from the Pyodide CDN; either way its sha256 must match
// pyodide-lock.json.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const src = root + "node_modules/pyodide/";
const out = root + "public/pyodide/";
const CORE = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
const PACKAGES = ["numpy"];

const version = JSON.parse(readFileSync(src + "package.json", "utf8")).version;
const lock = JSON.parse(readFileSync(src + "pyodide-lock.json", "utf8"));
mkdirSync(out, { recursive: true });
for (const f of CORE) copyFileSync(src + f, out + f);

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
for (const name of PACKAGES) {
  const pkg = lock.packages[name];
  if (pkg.depends.length) throw new Error(`${name} has dependencies (${pkg.depends}); add them to PACKAGES`);
  let wheel = existsSync(out + pkg.file_name) ? readFileSync(out + pkg.file_name) : null;
  if (!wheel && existsSync(src + pkg.file_name)) wheel = readFileSync(src + pkg.file_name);
  if (!wheel) {
    const url = `https://cdn.jsdelivr.net/pyodide/v${version}/full/${pkg.file_name}`;
    console.log(`downloading ${url}`);
    wheel = Buffer.from(await (await fetch(url)).arrayBuffer());
  }
  if (sha256(wheel) !== pkg.sha256) throw new Error(`${pkg.file_name}: sha256 does not match pyodide-lock.json`);
  writeFileSync(out + pkg.file_name, wheel);
}
console.log(`public/pyodide/: Pyodide ${version} + ${PACKAGES.join(", ")}`);
