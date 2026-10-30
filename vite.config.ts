import { defineConfig } from "vite";

// base "./" so the built site works from any path.
// preview.allowedHosts: the test server is reached by this machine's hostname from the LAN; Vite
// otherwise rejects any Host header but localhost and IP addresses.
export default defineConfig({
  base: "./",
  worker: { format: "es" },
  preview: { allowedHosts: true },
});
