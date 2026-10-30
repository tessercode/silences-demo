import { execSync } from "node:child_process";
import { defineConfig } from "vite";

// The release commit the bundle was built from, shown in the footer.
function silencesCommit() {
  try {
    return execSync("git -C vendor/silences describe --tags --always", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

// base "./" so the built site works from any path.
// preview.allowedHosts: the test server is reached by this machine's hostname from the LAN; Vite
// otherwise rejects any Host header but localhost and IP addresses.
export default defineConfig({
  base: "./",
  worker: { format: "es" },
  preview: { allowedHosts: true },
  define: { __SILENCES_COMMIT__: JSON.stringify(silencesCommit()) },
});
