/**
 * Production slice: vite-build the game + only in-play graphics/maps.
 * Full dump is ~1 GB; this is the roman loop that's actually loaded.
 * Prefers civ-paged atlases when `atlases/manifest.json` exists.
 *
 *   npm run pack          web zip → settlers-play.zip
 *   npm run pack:app      Tauri mac + win → build/macosx, build/win
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildings } from "../src/sim/data/buildings";
import { settlers } from "../src/sim/data/settlers";
import { FOOD, MILITARY, PRODUCTION } from "../src/session/command/pages";
import { packsForCivs } from "./atlas/groups";
import type { AtlasManifest } from "./atlas/manifest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GFX = join(ROOT, "assets/graphics");
const MAPS = join(ROOT, "assets/maps");
const DIST = join(ROOT, "dist");
const ZIP = join(ROOT, "settlers-play.zip");
const zip = !process.argv.includes("--no-zip");

const CIV = "roman";

type Catalog = { sprites: CatalogSprite[] };
type CatalogSprite = {
  path: string;
  group?: string;
  variant?: string;
  frame?: number;
  offsetX: number;
  offsetY: number;
  px?: number;
  torso?: { path: string; offsetX: number; offsetY: number; px?: number };
  shadow?: { path: string; offsetX: number; offsetY: number; px?: number };
};

function keepPrefixes(): string[] {
  const out = ["props/"];
  for (const kind of Object.keys(settlers)) out.push(`settlers/${CIV}/${kind}/`);
  for (const def of Object.values(buildings)) out.push(`${def.sheet}/`);
  for (const c of [...PRODUCTION, ...FOOD, ...MILITARY]) out.push(`${c.sheet}/`);
  return out;
}

function kept(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => path.startsWith(p));
}

function slim(s: CatalogSprite): CatalogSprite {
  const out: CatalogSprite = { path: s.path, offsetX: s.offsetX, offsetY: s.offsetY };
  if (s.group) out.group = s.group;
  if (s.variant) out.variant = s.variant;
  if (s.frame != null) out.frame = s.frame;
  if (s.torso) out.torso = s.torso;
  if (s.shadow) out.shadow = s.shadow;
  if (s.px != null && s.px !== 1) out.px = s.px;
  return out;
}

/** DOM `<img>` icons — first built / stack / idle-SE frame. */
function hudIcon(s: CatalogSprite): boolean {
  if ((s.frame ?? 0) !== 0) return false;
  if (s.variant === "built") return true;
  const g = s.group ?? "";
  if (g.startsWith("props/stack-")) return true;
  return /^settlers\/roman\/[^/]+\/idle\/none\/se$/.test(g);
}

function slimAtlas(man: AtlasManifest, packs: ReadonlySet<string>): AtlasManifest {
  const oldToNew = new Map<number, number>();
  const pages: AtlasManifest["pages"] = [];
  for (let i = 0; i < man.pages.length; i++) {
    const page = man.pages[i]!;
    if (!packs.has(page.pack)) continue;
    oldToNew.set(i, pages.length);
    pages.push(page);
  }
  const frames: AtlasManifest["frames"] = {};
  for (const [path, f] of Object.entries(man.frames)) {
    const n = oldToNew.get(f.page);
    if (n == null) continue;
    frames[path] = { ...f, page: n };
  }
  return { size: man.size, pad: man.pad, pages, frames };
}

async function copyIf(src: string, dest: string): Promise<boolean> {
  if (!existsSync(src)) {
    console.warn(`missing ${src}`);
    return false;
  }
  await mkdir(dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true });
  return true;
}

async function bytes(path: string): Promise<number> {
  if (!existsSync(path)) return 0;
  const s = await stat(path);
  return s.size;
}

console.log("vite build");
execSync("npx vite build", { cwd: ROOT, stdio: "inherit" });

const prefixes = keepPrefixes();
const gfxOut = join(DIST, "graphics");
await mkdir(gfxOut, { recursive: true });

await copyIf(join(GFX, "landscape-atlas.png"), join(gfxOut, "landscape-atlas.png"));

const atlasManPath = join(GFX, "atlases", "manifest.json");
const useAtlases = existsSync(atlasManPath);
if (useAtlases) {
  const man = JSON.parse(await readFile(atlasManPath, "utf8")) as AtlasManifest;
  const packs = new Set(packsForCivs([CIV]));
  const slimMan = slimAtlas(man, packs);
  const atlasOut = join(gfxOut, "atlases");
  await mkdir(atlasOut, { recursive: true });
  await writeFile(join(atlasOut, "manifest.json"), JSON.stringify(slimMan));
  for (const p of slimMan.pages) {
    await copyIf(join(GFX, "atlases", p.file), join(atlasOut, p.file));
  }
  console.log(`atlases ${man.pages.length} → ${slimMan.pages.length} pages`);
} else {
  await copyIf(join(GFX, "props"), join(gfxOut, "props"));
  for (const kind of Object.keys(settlers)) {
    await copyIf(join(GFX, "settlers", CIV, kind), join(gfxOut, "settlers", CIV, kind));
  }
  for (const def of Object.values(buildings)) {
    await copyIf(join(GFX, def.sheet), join(gfxOut, def.sheet));
  }
}

const raw = JSON.parse(await readFile(join(GFX, "catalog.json"), "utf8")) as Catalog;
const sprites = (raw.sprites ?? []).filter((s) => kept(s.path, prefixes)).map(slim);
await writeFile(join(gfxOut, "catalog.json"), JSON.stringify({ sprites }));
console.log(`catalog ${raw.sprites.length} → ${sprites.length} sprites`);

if (useAtlases) {
  let icons = 0;
  for (const s of sprites) {
    if (!hudIcon(s)) continue;
    if (await copyIf(join(GFX, s.path), join(gfxOut, s.path))) icons += 1;
  }
  console.log(`hud icons ${icons}`);
}

const mapsOut = join(DIST, "maps");
await mkdir(join(mapsOut, "tutorial"), { recursive: true });
const mapCat = JSON.parse(await readFile(join(MAPS, "catalog.json"), "utf8")) as {
  maps: { group: string; file: string }[];
};
const tutorial = mapCat.maps.filter((m) => m.group === "tutorial");
await writeFile(join(mapsOut, "catalog.json"), JSON.stringify({ maps: tutorial }));
for (const m of tutorial) {
  await copyIf(join(MAPS, m.file), join(mapsOut, m.file));
}

if (zip) {
  if (existsSync(ZIP)) {
    const { unlink } = await import("node:fs/promises");
    await unlink(ZIP);
  }
  execSync(`ditto -c -k --sequesterRsrc "${DIST}" "${ZIP}"`, { cwd: ROOT, stdio: "inherit" });
  const zipBytes = await bytes(ZIP);
  console.log(`zip   ${ZIP}  (${(zipBytes / 1e6).toFixed(1)} MB)`);
  console.log("share: unzip, then  npx serve .");
}

console.log(`dist  ${DIST}`);
console.log("contains reconstructed S3 graphics — they should own the game");
