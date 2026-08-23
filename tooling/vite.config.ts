/**
 * Separate Vite target for Forest Empire tools. Dev on 5174 so the game
 * can stay on 5173. `/graphics` is the dump at repo `assets/graphics`.
 * `/game_data` is `assets/game_data` — GET serves, PUT writes (Save in the editor).
 */
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig(({ command }) => ({
  root,
  base: command === "build" ? "./" : "/",
  clearScreen: false,
  plugins: [serveGraphics(), serveGameData()],
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

/**
 * Authoring JSON in the repo. GET is the Load URL; PUT is Save.
 * Only `*.json` files, no path escape. Invalid buildings JSON is rejected.
 */
function serveGameData(): Plugin {
  const dir = resolve(repo, "assets/game_data");
  const prefix = "/game_data/";
  return {
    name: "local-game-data",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith(prefix)) {
          next();
          return;
        }
        void handleGameData(dir, url.slice(prefix.length), req, res);
      });
    },
  };
}

async function handleGameData(dir: string, rawRel: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rel = decodeURIComponent(rawRel.split("?")[0] ?? "");
  if (!rel || rel.split(/[/\\]/).includes("..") || !rel.endsWith(".json")) {
    res.statusCode = 400;
    res.end("json only");
    return;
  }
  const abs = resolve(dir, rel);
  if (abs !== dir && !abs.startsWith(dir + sep)) {
    res.statusCode = 403;
    res.end();
    return;
  }
  const method = req.method ?? "GET";
  if (method === "GET" || method === "HEAD") {
    if (!existsSync(abs)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader("content-type", "application/json");
    if (method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(abs).pipe(res);
    return;
  }
  if (method !== "PUT") {
    res.statusCode = 405;
    res.end();
    return;
  }
  let body: Buffer;
  try {
    body = await readBody(req, 8_000_000);
  } catch {
    res.statusCode = 413;
    res.end("too large");
    return;
  }
  const text = body.toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    res.statusCode = 400;
    res.end("invalid json");
    return;
  }
  if (!isBuildingsPayload(parsed)) {
    res.statusCode = 400;
    res.end("not a forest-empire.buildings file");
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(abs, text.endsWith("\n") ? text : `${text}\n`);
  res.statusCode = 204;
  res.end();
}

function isBuildingsPayload(raw: unknown): boolean {
  if (typeof raw !== "object" || raw == null) return false;
  const o = raw as Record<string, unknown>;
  return o.format === "forest-empire.buildings" && typeof o.version === "number" && Array.isArray(o.buildings);
}

function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer | string) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      size += buf.length;
      if (size > max) {
        req.destroy();
        reject(new Error("too large"));
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
