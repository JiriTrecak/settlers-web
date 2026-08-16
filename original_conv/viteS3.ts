import { createReadStream, existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { Plugin } from "vite";
import { parseDatFileName } from "./dat/parseDat";

export type GfxManifestEntry = {
  name: string;
  fileIndex: number;
  color: "rgb555" | "rgb565";
  url: string;
  bytes: number;
};

/** Dev-only: serve gitignored original/GFX at /s3. */
export function localS3Plugin(): Plugin {
  const gfxDir = resolve("original/GFX");

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
