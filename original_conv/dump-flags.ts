/**
 * Dump hut flags from GFX file 13 into `props/flag-door` / `props/flag-roof`
 * and patch catalog.json. Full `dump:graphics` also writes these; this is the cheap path.
 *
 * Door = seq 63 (workerless huts). Roof = seq 64 (occupied worker huts).
 * Torso layer is the cloth tinted with player color.
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatArchive, parseDatFileName, type DecodedImage } from "./dat";
import { encodePng } from "./png";
import type { Sprite } from "./catalog/sprite";
import { ORIGINAL_GFX, REPO_ROOT } from "./original";

const OUT = join(REPO_ROOT, "assets/graphics");
const FILE = 13;
const FLAGS: { title: string; slug: string; seq: number }[] = [
  { title: "flag door", slug: "flag-door", seq: 63 },
  { title: "flag roof", slug: "flag-roof", seq: 64 },
];

function pad(n: number, w = 3): string {
  return String(n).padStart(w, "0");
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

const added: Sprite[] = [];
for (const { title, slug, seq } of FLAGS) {
  const group = `props/${slug}`;
  await rm(join(OUT, group), { recursive: true, force: true });
  const n = dat.frameCount("settler", seq);
  for (let i = 0; i < n; i++) {
    const frame = dat.decode("settler", seq, i);
    if (frame.width === 0) continue;
    const rel = `${group}/${pad(i)}`;
    await writeImg(rel, frame);
    const t = layer(dat, "torso", seq, i);
    const s = layer(dat, "shadow", seq, i);
    if (t) await writeImg(`${rel}.torso`, t);
    if (s) await writeImg(`${rel}.shadow`, s);
    added.push({
      id: `${group}/${pad(i)}`,
      category: "props",
      title,
      subtitle: n > 1 ? `frame ${i + 1}/${n}` : "",
      tags: ["prop", slug],
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
  }
  console.log(`${group} ${n} frames (seq ${seq})`);
}

const catalogPath = join(OUT, "catalog.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as { sprites: Sprite[] };
const drop = new Set(FLAGS.map((f) => `props/${f.slug}`));
catalog.sprites = catalog.sprites.filter((s) => !drop.has(s.group ?? ""));
catalog.sprites.push(...added);
catalog.sprites.sort((a, b) => a.id.localeCompare(b.id));
await writeFile(catalogPath, JSON.stringify({ sprites: catalog.sprites }));
console.log(`catalog ${catalog.sprites.length} sprites`);
