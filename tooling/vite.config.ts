/**
 * Tools Vite target. Dev on 5175 so the game stays on 5173.
 * Game has its own Tailwind (utilities only, no preflight). This target is other tools.
 */
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import {assetStudio} from "./asset-studio/server/plugin";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ command }) => ({
  root,
  // Keep dependency hashes independent from the simultaneously running game server.
  cacheDir: fileURLToPath(new URL("../node_modules/.vite-asset-studio", import.meta.url)),
  base: command === "build" ? "./" : "/",
  clearScreen: false,
  plugins: [tailwindcss(), assetStudio(fileURLToPath(new URL("..", import.meta.url)))],
  server: {
    host: "127.0.0.1",
    port: 5175,
    strictPort: true,
    fs: {deny: ["**/.asset-work/**", "**/.env*", "**/*.{crt,pem}", "**/.git/**"]},
    watch: {
      ignored: ["**/src-tauri/**", "**/.asset-work/**", "**/art/**"],
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
