import {validateFiles} from '../asset-studio/server/manifest';
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

async function readSource(file:string):Promise<ContentSource>{const raw=JSON.parse(await readFile(file,'utf8'));const manifest=JSON.parse(await readFile(resolve(file,'../../assets/manifest.json'),'utf8'));return {...raw,assets:manifest.records.flatMap((r:{render:unknown[]})=>r.render)};}
async function validateModels(root: string, registry: ContentRegistry) {
  if(await stat(resolve(root,'.asset-work/publishing')).catch(()=>null))throw Error('Asset publication is in progress. Retry after it completes.');
  await validateFiles(root,JSON.parse(await readFile(resolve(root,'assets/manifest.json'),'utf8')));
  const assetsRoot = resolve(root, "assets"),
    catalog = JSON.parse(
      await readFile(resolve(assetsRoot, "manifest.json"), "utf8"),
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
    for (const model of [asset.file, asset.harvestAnimation].filter((p): p is string => !!p)) {
      const file = resolve(root, model),
        path = relative(assetsRoot, file);
      if (
        path.startsWith("..") ||
        isAbsolute(path) ||
        !/\.(glb|gltf)$/.test(file) ||
        !(await stat(file).catch(() => null))?.isFile()
      )
        throw new Error(`${asset.id}: missing project model ${model}`);
    }
    if (
      asset.sceneryAsset &&
      !catalog.records.flatMap((r:{scenery:unknown[]})=>r.scenery).some(
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
    handleHotUpdate(context) {
      if(context.file.includes('/assets/')||context.file.endsWith('/src/shared/assets/urls.generated.ts'))return []; // Explicit reload after reviewed publication.
      // Content is a match contract. Saving a draft must neither mutate an
      // active simulation nor reload the world editor and discard its state.
      // Vite invalidates the module; an explicit page reload loads the revision.
      if (context.file === resolve(root, "content/game.json")) return [];
    },
    async buildStart() {
      const registry = new ContentRegistry(
        await readSource(resolve(root, "content/game.json")),
      );
      await validateModels(root, registry);
    },
    configureServer(server) {
      server.middlewares.use(async(req,res,next)=>{if((req.url?.includes('/assets/')||req.url?.includes('/src/shared/assets/'))&&await stat(resolve(root,'.asset-work/publishing')).catch(()=>null)){res.statusCode=503;res.setHeader('Retry-After','1');res.end('Assets are being published. Retry shortly.');return;}next();});
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
          const current = await readSource(file);
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
              latest = await readSource(file);
            if (body.revision !== fingerprint(latest)) {
              fail(
                409,
                "Content changed on disk. Reopen the editor before saving.",
              );
              return;
            }
            if(JSON.stringify(body.source.assets)!==JSON.stringify(latest.assets))throw Error("Manage assets in Asset Studio.");
            const source = body.source as ContentSource,
              registry = new ContentRegistry(source);
            await validateModels(server.config.root, registry);
            const dir = resolve(server.config.root, "assets/maps");
            for (const name of await readdir(dir, {recursive:true})) {
              if (!name.endsWith(".utcmap")) continue;
              const map = parseUtcMap(
                JSON.parse(await readFile(resolve(dir, name), "utf8")),
              );
              if (!map) throw new Error(`${name}: invalid map`);
              validatePlacements(map, registry);
            }
            if (fingerprint(source) !== fingerprint(latest)) {
              const temporary = file + ".pending";
              await writeFile(temporary, JSON.stringify({...source,assets:undefined}, null, 2) + "\n");
              await rename(temporary, file);
            }
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
