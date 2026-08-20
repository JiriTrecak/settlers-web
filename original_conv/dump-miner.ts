/**
 * Dump roman settler clips into `settlers/roman/{type}` and patch catalog.json.
 * Default MINER. Food: `npm run dump:food-settlers`.
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatArchive, parseDatFileName, type DecodedImage } from "./dat";
import { encodePng } from "./png";
import { clipPath, framesOf, loadAllMovableClips } from "./catalog/movables";
import type { LayerRef, Sprite } from "./catalog/sprite";
import { ORIGINAL_GFX, REPO_ROOT } from "./original";

const OUT = join(REPO_ROOT, "assets/graphics");
const MOVABLES = join(REPO_ROOT, "original_conv/catalog/movables");
const TYPES = (process.argv.slice(2).length ? process.argv.slice(2) : ["MINER"]).map((t) => t.toUpperCase());

function pad(n: number, w = 3): string {
  return String(n).padStart(w, "0");
}

async function writeImg(rel: string, img: DecodedImage): Promise<void> {
  if (img.width === 0 || img.height === 0) return;
  await mkdir(dirname(join(OUT, `${rel}.png`)), { recursive: true });
  await writeFile(join(OUT, `${rel}.png`), encodePng(img.width, img.height, img.rgba));
}

function layerOf(rel: string, img: DecodedImage): LayerRef {
  return { path: `${rel}.png`, width: img.width, height: img.height, offsetX: img.offsetX, offsetY: img.offsetY };
}

function folderOf(type: string): string {
  return type.toLowerCase().replace(/_/g, "-");
}

if (!existsSync(ORIGINAL_GFX)) {
  console.error(`missing ${ORIGINAL_GFX}`);
  process.exit(1);
}

const names = (await readdir(ORIGINAL_GFX)).filter((n) => parseDatFileName(n));
const byIndex = new Map<number, { name: string; color: "rgb555" | "rgb565" }>();
for (const name of names) {
  const parsed = parseDatFileName(name)!;
  const prev = byIndex.get(parsed.fileIndex);
  if (prev?.color === "rgb565" && parsed.color === "rgb555") continue;
  byIndex.set(parsed.fileIndex, { name, color: parsed.color });
}

const archives = new Map<number, DatArchive>();
async function archive(file: number): Promise<DatArchive | null> {
  const hit = archives.get(file);
  if (hit) return hit;
  const meta = byIndex.get(file);
  if (!meta) return null;
  const buf = await readFile(join(ORIGINAL_GFX, meta.name));
  const dat = new DatArchive(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), meta.color, file, meta.name);
  archives.set(file, dat);
  return dat;
}

const allClips = await loadAllMovableClips(MOVABLES);
const catalogPath = join(OUT, "catalog.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as { sprites: Sprite[] };

let dumped = 0;
for (const type of TYPES) {
  const clips = allClips.filter((c) => c.civ === "roman" && c.type === type);
  if (clips.length === 0) {
    console.error(`no roman ${type} clips`);
    continue;
  }
  const folder = folderOf(type);
  catalog.sprites = catalog.sprites.filter((s) => !(s.group ?? "").startsWith(`settlers/roman/${folder}/`));
  const seen = new Set<string>();
  let n = 0;
  for (const clip of clips) {
    const dir = clipPath(clip);
    const key = `${clip.civ}:${clip.type}:${clip.action}:${clip.material}:${clip.direction}:${clip.file}:${clip.sequence}:${clip.start}:${clip.duration}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const dat = await archive(clip.file);
    if (!dat) continue;
    const frames = framesOf(clip);
    for (let i = 0; i < frames.length; i++) {
      const frameIndex = frames[i]!;
      const img = dat.decode("settler", clip.sequence, frameIndex);
      if (img.width === 0) continue;
      const rel = `${dir}/${pad(i)}`;
      await writeImg(rel, img);
      const t = dat.decode("torso", clip.sequence, frameIndex);
      const s = dat.decode("shadow", clip.sequence, frameIndex);
      if (t.width > 0) await writeImg(`${rel}.torso`, t);
      if (s.width > 0) await writeImg(`${rel}.shadow`, s);
      catalog.sprites.push({
        id: rel,
        category: "settlers",
        title: folder,
        subtitle: `${clip.action} ${clip.material} ${clip.direction}`.toLowerCase(),
        tags: ["settler", "roman", folder],
        group: dir,
        frame: i,
        frames: frames.length,
        path: `${rel}.png`,
        torso: t.width > 0 ? layerOf(`${rel}.torso`, t) : undefined,
        shadow: s.width > 0 ? layerOf(`${rel}.shadow`, s) : undefined,
        width: img.width,
        height: img.height,
        offsetX: img.offsetX,
        offsetY: img.offsetY,
      });
      n += 1;
      dumped += 1;
    }
  }
  console.log(`${folder} ${n} frames`);
}

if (dumped === 0) process.exit(1);

catalog.sprites.sort((a, b) => a.id.localeCompare(b.id));
await writeFile(catalogPath, JSON.stringify({ sprites: catalog.sprites }));
console.log(`catalog ${catalog.sprites.length}`);
