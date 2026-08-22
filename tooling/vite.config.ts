/**
 * Separate Vite target for Forest Empire tools. Dev on 5174 so the game
 * can stay on 5173. Later tools may alias into `../src` (render / sim).
 */
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ command }) => ({
  root,
  base: command === "build" ? "./" : "/",
  clearScreen: false,
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
