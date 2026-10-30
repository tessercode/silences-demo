import { defineConfig } from "vite";

// base "./" so the built site works from any path (GitHub Pages serves it under /silences-demo/).
export default defineConfig({ base: "./", worker: { format: "es" } });
