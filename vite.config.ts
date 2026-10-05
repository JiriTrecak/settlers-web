import {fengariBrowser} from "./tooling/scripting/fengariBrowser.ts";
import { contentAuthoring } from "./tooling/content/plugin.ts";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
  clearScreen: false,
  resolve: {alias: {"@":fileURLToPath(new URL("./src",import.meta.url))}},
  optimizeDeps: {rolldownOptions: {plugins:[fengariBrowser()]}},
  plugins: [fengariBrowser(), tailwindcss(), contentAuthoring()],
  worker: { plugins: () => [fengariBrowser()] },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: {deny:["**/.asset-work/**", "**/.env*", "**/*.{crt,pem}", "**/.git/**"]},
    watch: {
      // Independent workbenches build into nested dist directories. Their HTML
      // output must not reload an open map editor and discard its live session.
      ignored: ["**/src-tauri/**", "**/dist/**"],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        reference: fileURLToPath(
          new URL("./reference-stage.html", import.meta.url),
        ),
      },
    },
  },
}));
