import { createReadStream, existsSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import type { Plugin } from "vite";

/** Dev-only: serve reconstructed PNGs + catalog at /graphics. */
export function localGraphicsPlugin(): Plugin {
  return serveDumpDir("local-graphics", "/graphics/", resolve("assets/graphics"), (ext) =>
    ext === ".json" ? "application/json" : "image/png",
  );
}

/** Dev-only: serve dumped native maps + catalog at /maps. */
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
