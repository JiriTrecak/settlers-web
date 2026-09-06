/**
 * Tools Vite target. Dev on 5174 so the game stays on 5173.
 * Game has its own Tailwind (utilities only, no preflight). This target is other tools.
 */
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ command }) => ({
  root,
  base: command === "build" ? "./" : "/",
  clearScreen: false,
  plugins: [tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("./index.html", import.meta.url)),
    },
  },
}));
