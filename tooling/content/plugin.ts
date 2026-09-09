import type { Plugin } from "vite";
import { readFile, writeFile, rename, readdir, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import {
  ContentRegistry,
  fingerprint,
  type ContentSource,
} from "../../src/content/registry";
import { validatePlacements } from "../../src/content/map";
import { parseUtcMap } from "../../src/shared/map/utcmap";

async function validateModels(root: string, registry: ContentRegistry) {
  const assetsRoot = resolve(root, "assets"),
    catalog = JSON.parse(
      await readFile(resolve(assetsRoot, "catalog.json"), "utf8"),
    );
  for (const asset of registry.assets) {
    if (asset.image) {
      const file = resolve(root, asset.image), path = relative(assetsRoot, file);
      if (path.startsWith("..") || isAbsolute(path) || !file.endsWith(".png"))
        throw new Error(`${asset.id}: icon must be a project PNG`);
      const bytes = await readFile(file);
      if (bytes.length < 24 || bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a")
        throw new Error(`${asset.id}: invalid PNG image`);
      const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
      if (width !== height || width < 1 || width > 128)
        throw new Error(`${asset.id}: icons must be square and at most 128px`);
    }
    if (asset.file) {
      const file = resolve(root, asset.file),
        path = relative(assetsRoot, file);
      if (
        path.startsWith("..") ||
        isAbsolute(path) ||
        !/\.(glb|gltf)$/.test(file) ||
        !(await stat(file).catch(() => null))?.isFile()
      )
        throw new Error(`${asset.id}: missing project model ${asset.file}`);
    }
    if (
      asset.sceneryAsset &&
      !catalog.assets.some(
        (a: { id: string; file: string }) =>
          a.id === asset.sceneryAsset && resolve(assetsRoot, a.file) === resolve(root, asset.file!),
      )
    )
      throw new Error(
        `${asset.id}: sceneryAsset must reference the same model in assets/catalog.json`,
      );
  }
}

/** Local authoring endpoint. One rename commits the entire validated graph. */
export function contentAuthoring(): Plugin {
  let busy = false;
  let root = "";
  return {
    name: "content-authoring",
    configResolved(config) {
      root = config.root;
    },
    async buildStart() {
      const registry = new ContentRegistry(
        JSON.parse(await readFile(resolve(root, "content/game.json"), "utf8")),
      );
      await validateModels(root, registry);
    },
    configureServer(server) {
      const file = resolve(server.config.root, "content/game.json");
      server.middlewares.use("/__authoring/content", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        const fail = (status: number, error: string) => {
          res.statusCode = status;
          res.end(JSON.stringify({ error }));
        };
        if (req.method !== "GET" && req.method !== "POST") {
          fail(405, "GET or POST required");
          return;
        }
        if (
          req.headers.origin &&
          req.headers.origin !== `http://${req.headers.host}`
        ) {
          fail(403, "Same-origin authoring only");
          return;
        }
        try {
          const current = JSON.parse(await readFile(file, "utf8"));
          if (req.method === "GET") {
            res.end(
              JSON.stringify({
                source: current,
                revision: fingerprint(current),
              }),
            );
            return;
          }
          if (busy) {
            fail(409, "Another content save is in progress");
            return;
          }
          busy = true;
          try {
            let data = "";
            for await (const chunk of req) {
              data += chunk;
              if (data.length > 2_000_000)
                throw new Error("Content document is too large");
            }
            const body = JSON.parse(data),
              latest = JSON.parse(await readFile(file, "utf8"));
            if (body.revision !== fingerprint(latest)) {
              fail(
                409,
                "Content changed on disk. Reopen the editor before saving.",
              );
              return;
            }
            const source = body.source as ContentSource,
              registry = new ContentRegistry(source);
            await validateModels(server.config.root, registry);
            const dir = resolve(server.config.root, "assets/maps/showcase");
            for (const name of await readdir(dir)) {
              if (!name.endsWith(".utcmap")) continue;
              const map = parseUtcMap(
                JSON.parse(await readFile(resolve(dir, name), "utf8")),
              );
              if (!map) throw new Error(`${name}: invalid map`);
              validatePlacements(map, registry);
            }
            const temporary = file + ".pending";
            await writeFile(temporary, JSON.stringify(source, null, 2) + "\n");
            await rename(temporary, file);
            res.end(
              JSON.stringify({
                revision: fingerprint(source),
                content: registry.fingerprint,
              }),
            );
          } finally {
            busy = false;
          }
        } catch (e) {
          fail(400, (e as Error).message);
        }
      });
    },
  };
}
