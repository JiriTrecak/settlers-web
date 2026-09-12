import {fengariBrowser} from "./tooling/scripting/fengariBrowser";
import { contentAuthoring } from "./tooling/content/plugin";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
  clearScreen: false,
  optimizeDeps: {rolldownOptions: {plugins:[fengariBrowser()]}},
  plugins: [fengariBrowser(), tailwindcss(), contentAuthoring()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: {deny:["**/.asset-work/**", "**/.env*", "**/*.{crt,pem}", "**/.git/**"]},
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        reference: fileURLToPath(
          new URL("./reference-stage.html", import.meta.url),
        ),
        comparison: fileURLToPath(
          new URL("./visual-compare.html", import.meta.url),
        ),
      },
    },
  },
}));
