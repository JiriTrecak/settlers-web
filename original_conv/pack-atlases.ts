/**
 * Pack catalog PNGs into civ-paged atlases + a contact sheet.
 *
 *   npm run pack:atlases
 *   npm run pack:atlases -- --size 1024
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { packOf, packOrder } from "./atlas/groups";
import { blitPadded, packPages } from "./atlas/pack";
import type { AtlasManifest } from "./atlas/manifest";
import { decodePng, encodePng } from "./png";
import { REPO_ROOT } from "./original";

const GFX = join(REPO_ROOT, "assets/graphics");
const DEFAULT_OUT = join(GFX, "atlases");
const SIZE_DEFAULT = 2048;
const PAD = 1;
const CONCURRENCY = 48;

type CatalogSprite = {
  path: string;
  group?: string;
  category?: string;
  width?: number;
  height?: number;
  torso?: { path: string };
  shadow?: { path: string };
};

const args = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
}

const size = Math.max(64, Number(flag("--size", String(SIZE_DEFAULT))) | 0);
const outDir = flag("--out", DEFAULT_OUT);
const only = flag("--packs", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!existsSync(join(GFX, "catalog.json"))) {
  console.error(`missing ${join(GFX, "catalog.json")} — run npm run dump:graphics`);
  process.exit(1);
}

const catalog = JSON.parse(await readFile(join(GFX, "catalog.json"), "utf8")) as { sprites?: CatalogSprite[] };
const sprites = catalog.sprites ?? [];

const byPack = new Map<string, Set<string>>();
for (const s of sprites) {
  const pack = packOf(s);
  if (!pack) continue;
  if (only.length > 0 && !only.includes(pack)) continue;
  let set = byPack.get(pack);
  if (!set) {
    set = new Set();
    byPack.set(pack, set);
  }
  set.add(s.path);
  if (s.torso?.path) set.add(s.torso.path);
  if (s.shadow?.path) set.add(s.shadow.path);
}

if (existsSync(outDir)) {
  for (const name of await readdir(outDir)) {
    if (name.endsWith(".png") || name === "manifest.json" || name === "index.html") {
      await rm(join(outDir, name));
    }
  }
}
await mkdir(outDir, { recursive: true });

const manifest: AtlasManifest = { size, pad: PAD, pages: [], frames: {} };
let packed = 0;
let missing = 0;
let skipped = 0;

for (const pack of packOrder([...byPack.keys()])) {
  const paths = [...byPack.get(pack)!].sort();
  console.log(`${pack}: ${paths.length} pngs`);
  const images = await mapPool(paths, CONCURRENCY, async (rel) => {
    const abs = join(GFX, rel);
    if (!existsSync(abs)) {
      missing += 1;
      return null;
    }
    try {
      const png = decodePng(await readFile(abs));
      return { rel, ...png };
    } catch (e) {
      console.warn(`decode fail ${rel}: ${e instanceof Error ? e.message : e}`);
      missing += 1;
      return null;
    }
  });
  const items = images.filter((im): im is NonNullable<typeof im> => im != null);
  const { pages, skipped: skipIx } = packPages(
    items.map((im) => ({ w: im.width, h: im.height })),
    size,
    PAD,
  );
  skipped += skipIx.length;
  for (const i of skipIx) console.warn(`too big for ${size}: ${items[i]?.rel}`);

  for (let p = 0; p < pages.length; p++) {
    const page = pages[p]!;
    const rgba = new Uint8ClampedArray(size * size * 4);
    for (const f of page.frames) {
      const im = items[f.i]!;
      blitPadded(rgba, size, size, im.rgba, im.width, im.height, f.x, f.y, PAD);
      manifest.frames[im.rel] = { page: manifest.pages.length, x: f.x, y: f.y, w: f.w, h: f.h };
    }
    const file = `${pack}-${p}.png`;
    await writeFile(join(outDir, file), encodePng(size, size, rgba, 4));
    const fill = page.filled / (size * size);
    manifest.pages.push({ file, pack, frames: page.frames.length, fill: Math.round(fill * 1000) / 1000 });
    packed += page.frames.length;
    console.log(`  ${file}  ${page.frames.length} frames  fill ${(fill * 100).toFixed(1)}%`);
  }
}

await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest));
await writeFile(join(outDir, "index.html"), contactSheet(manifest));
console.log(
  `wrote ${manifest.pages.length} pages, ${packed} frames → ${outDir}` +
    (missing || skipped ? `  (missing ${missing}, skipped ${skipped})` : ""),
);

function contactSheet(m: AtlasManifest): string {
  const cards = m.pages
    .map((p) => {
      const pct = (p.fill * 100).toFixed(1);
      return `<figure><a href="${p.file}"><img src="${p.file}" alt="${p.file}" width="512" height="512"></a><figcaption>${p.file}<br>${p.pack} · ${p.frames} frames · ${pct}%</figcaption></figure>`;
    })
    .join("\n");
  return `<!doctype html>
<meta charset="utf-8">
<title>atlases ${m.size}²</title>
<style>
  body { margin: 24px; background: #111; color: #ddd; font: 14px/1.4 ui-monospace, monospace; }
  h1 { font-size: 16px; font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
  figure { margin: 0; }
  img { width: 100%; height: auto; image-rendering: pixelated; background: #1c1c1c; border: 1px solid #333; }
  figcaption { margin-top: 8px; color: #aaa; }
</style>
<h1>${m.pages.length} pages · ${m.size}² · pad ${m.pad} · ${Object.keys(m.frames).length} frames</h1>
<p>Open a sheet. Match loads <code>props</code> + the civs in play, not every page.</p>
<div class="grid">
${cards}
</div>
`;
}

async function mapPool<T, U>(items: readonly T[], n: number, fn: (item: T) => Promise<U>): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!);
    }
  }
  const workers = Math.min(n, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}
