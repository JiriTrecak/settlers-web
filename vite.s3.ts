import { createReadStream, existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import type { Plugin } from "vite";
import { parseDatFileName } from "./src/assets/dat/parseDat";

export type GfxManifestEntry = {
  name: string;
  fileIndex: number;
  color: "rgb555" | "rgb565";
  url: string;
  bytes: number;
};

/** Dev-only: serve gitignored GFX/ at /s3 without copying into dist. */
export function localS3Plugin(): Plugin {
  const gfxDir = resolve("GFX");

  return {
    name: "local-s3",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";

        if (url === "/s3/manifest.json") {
          void (async () => {
            if (!existsSync(gfxDir)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ gfx: [] }));
              return;
            }
            const names = await readdir(gfxDir);
            const byIndex = new Map<number, GfxManifestEntry>();
            for (const name of names) {
              const parsed = parseDatFileName(name);
              if (!parsed) continue;
              const bytes = (await stat(join(gfxDir, name))).size;
              const prev = byIndex.get(parsed.fileIndex);
              if (prev?.color === "rgb565" && parsed.color === "rgb555") continue;
              byIndex.set(parsed.fileIndex, {
                name,
                fileIndex: parsed.fileIndex,
                color: parsed.color,
                url: `/s3/GFX/${encodeURIComponent(name)}`,
                bytes,
              });
            }
            const gfx = [...byIndex.values()].sort((a, b) => a.fileIndex - b.fileIndex);
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ gfx }));
          })().catch(next);
          return;
        }

        const hit = /^\/s3\/GFX\/([^/]+)$/.exec(url);
        if (!hit) {
          next();
          return;
        }
        const name = basename(decodeURIComponent(hit[1]!));
        const abs = resolve(gfxDir, name);
        if (dirname(abs) !== gfxDir || !existsSync(abs)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("content-type", "application/octet-stream");
        createReadStream(abs).pipe(res);
      });
    },
  };
}

/** Dev-only: serve reconstructed PNGs + catalog at /graphics. */
export function localGraphicsPlugin(): Plugin {
  return serveDumpDir("local-graphics", "/graphics/", resolve("assets/graphics"), (ext) =>
    ext === ".json" ? "application/json" : "image/png",
  );
}

/** Dev-only: serve dumped original maps + catalog at /maps. */
export function localMapsPlugin(): Plugin {
  return serveDumpDir("local-maps", "/maps/", resolve("assets/maps"), (ext) =>
    ext === ".json" ? "application/json" : "application/octet-stream",
  );
}

function serveDumpDir(
  name: string,
  prefix: string,
  dir: string,
  contentType: (ext: string) => string,
): Plugin {
  return {
    name,
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
        res.setHeader("content-type", contentType(extname(abs).toLowerCase()));
        createReadStream(abs).pipe(res);
      });
    },
  };
}
