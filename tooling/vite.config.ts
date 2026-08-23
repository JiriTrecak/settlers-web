/**
 * Separate Vite target for Forest Empire tools. Dev on 5174 so the game
 * can stay on 5173. `/graphics` is the dump at repo `assets/graphics`.
 */
import { createReadStream, existsSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig(({ command }) => ({
  root,
  base: command === "build" ? "./" : "/",
  clearScreen: false,
  plugins: [serveGraphics()],
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

/** Dev-only: reconstructed PNGs + catalog.json. Packed tools dist does not bundle the dump. */
function serveGraphics(): Plugin {
  const dir = resolve(repo, "assets/graphics");
  const prefix = "/graphics/";
  return {
    name: "local-graphics",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith(prefix)) {
          next();
          return;
        }
        const rel = decodeURIComponent(url.slice(prefix.length));
        if (!rel || rel.split("/").includes("..")) {
          res.statusCode = 400;
          res.end();
          return;
        }
        const abs = resolve(dir, rel);
        if (abs !== dir && !abs.startsWith(dir + sep)) {
          res.statusCode = 403;
          res.end();
          return;
        }
        if (!existsSync(abs)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        const ext = extname(abs).toLowerCase();
        res.setHeader("content-type", ext === ".json" ? "application/json" : "image/png");
        createReadStream(abs).pipe(res);
      });
    },
  };
}
