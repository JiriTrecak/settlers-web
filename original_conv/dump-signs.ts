/**
 * Dump resource-found signs (GFX file 1 seq 94–99) into `props/found-*`
 * and patch catalog.json. Full `dump:graphics` also writes these.
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatArchive, parseDatFileName, type DecodedImage } from "./dat";
import { encodePng } from "./png";
import type { Sprite } from "./catalog/sprite";
import { ORIGINAL_GFX, REPO_ROOT } from "./original";

const OUT = join(REPO_ROOT, "assets/graphics");
const FILE = 1;

/** Seq → catalog group. Fill 0–1 picks the frame. */
const SIGNS = [
  { title: "found coal", seq: 94 },
  { title: "found gems", seq: 95 },
  { title: "found gold", seq: 96 },
  { title: "found iron", seq: 97 },
  { title: "found brimstone", seq: 98 },
  { title: "found nothing", seq: 99 },
] as const;

function pad(n: number, w = 3): string {
  return String(n).padStart(w, "0");
}

function slug(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "-");
}

async function writeImg(rel: string, img: DecodedImage): Promise<void> {
  if (img.width === 0 || img.height === 0) return;
  const abs = join(OUT, `${rel}.png`);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, encodePng(img.width, img.height, img.rgba));
}

function layer(dat: DatArchive, kind: "torso" | "shadow", seq: number, frame: number): DecodedImage | null {
  const img = dat.decode(kind, seq, frame);
  return img.width > 0 ? img : null;
}

if (!existsSync(ORIGINAL_GFX)) {
  console.error(`missing ${ORIGINAL_GFX}`);
  process.exit(1);
}

const names = (await readdir(ORIGINAL_GFX)).filter((n) => parseDatFileName(n));
let file: { name: string; color: "rgb555" | "rgb565" } | null = null;
for (const name of names) {
  const parsed = parseDatFileName(name)!;
  if (parsed.fileIndex !== FILE) continue;
  if (file?.color === "rgb565" && parsed.color === "rgb555") continue;
  file = { name, color: parsed.color };
}
if (!file) {
  console.error(`missing GFX file ${FILE}`);
  process.exit(1);
}

const buf = await readFile(join(ORIGINAL_GFX, file.name));
const dat = new DatArchive(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), file.color, FILE, file.name);

const catalogPath = join(OUT, "catalog.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as { sprites: Sprite[] };
const keep = new Set(SIGNS.map((s) => `props/${slug(s.title)}`));
catalog.sprites = catalog.sprites.filter((s) => !keep.has(s.group ?? ""));

for (const sign of SIGNS) {
  const group = `props/${slug(sign.title)}`;
  await rm(join(OUT, group), { recursive: true, force: true });
  const n = dat.frameCount("settler", sign.seq);
  let frames = 0;
  for (let i = 0; i < n; i++) {
    const frame = dat.decode("settler", sign.seq, i);
    if (frame.width === 0) continue;
    const rel = `${group}/${pad(i)}`;
    await writeImg(rel, frame);
    const t = layer(dat, "torso", sign.seq, i);
    const s = layer(dat, "shadow", sign.seq, i);
    if (t) await writeImg(`${rel}.torso`, t);
    if (s) await writeImg(`${rel}.shadow`, s);
    catalog.sprites.push({
      id: `${group}/${pad(i)}`,
      category: "props",
      title: sign.title,
      subtitle: n > 1 ? `frame ${i + 1}/${n}` : "",
      tags: ["prop", slug(sign.title)],
      group,
      frame: i,
      frames: n,
      path: `${rel}.png`,
      torso: t
        ? { path: `${rel}.torso.png`, width: t.width, height: t.height, offsetX: t.offsetX, offsetY: t.offsetY }
        : undefined,
      shadow: s
        ? { path: `${rel}.shadow.png`, width: s.width, height: s.height, offsetX: s.offsetX, offsetY: s.offsetY }
        : undefined,
      width: frame.width,
      height: frame.height,
      offsetX: frame.offsetX,
      offsetY: frame.offsetY,
    });
    frames += 1;
  }
  console.log(`${group} ${frames} frames (seq ${sign.seq})`);
}

catalog.sprites.sort((a, b) => a.id.localeCompare(b.id));
await writeFile(catalogPath, JSON.stringify({ sprites: catalog.sprites }));
console.log(`catalog ${catalog.sprites.length} sprites`);
