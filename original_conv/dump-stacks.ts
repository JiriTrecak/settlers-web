/**
 * Dump goods-stack sequences from GFX file 1 into `props/stack-{material}` and
 * patch catalog.json. Full `dump:graphics` also writes these; this is the cheap path.
 *
 * Seq indices are the original stack-image slots: plank 33, trunk 41, stone 43, …
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatArchive, parseDatFileName, type DecodedImage } from "./dat";
import { encodePng } from "./png";
import type { Sprite } from "./catalog/sprite";
import { ORIGINAL_GFX, REPO_ROOT } from "./original";

const OUT = join(REPO_ROOT, "assets/graphics");
const STACKS: { material: string; seq: number }[] = [
  { material: "plank", seq: 33 },
  { material: "trunk", seq: 41 },
  { material: "stone", seq: 43 },
  { material: "axe", seq: 46 },
  { material: "hammer", seq: 51 },
  { material: "pick", seq: 53 },
  { material: "saw", seq: 54 },
  { material: "blade", seq: 55 },
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

if (!existsSync(ORIGINAL_GFX)) {
  console.error(`missing ${ORIGINAL_GFX}`);
  process.exit(1);
}

const names = (await readdir(ORIGINAL_GFX)).filter((n) => parseDatFileName(n));
let file1: { name: string; color: "rgb555" | "rgb565" } | null = null;
for (const name of names) {
  const parsed = parseDatFileName(name)!;
  if (parsed.fileIndex !== 1) continue;
  if (file1?.color === "rgb565" && parsed.color === "rgb555") continue;
  file1 = { name, color: parsed.color };
}
if (!file1) {
  console.error("missing GFX file 1");
  process.exit(1);
}

const buf = await readFile(join(ORIGINAL_GFX, file1.name));
const dat = new DatArchive(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), file1.color, 1, file1.name);

const added: Sprite[] = [];
for (const { material, seq } of STACKS) {
  const group = `props/stack-${material}`;
  await rm(join(OUT, group), { recursive: true, force: true });
  const n = dat.frameCount("settler", seq);
  for (let i = 0; i < n; i++) {
    const frame = dat.decode("settler", seq, i);
    if (frame.width === 0) continue;
    const rel = `${group}/${pad(i)}`;
    await writeImg(rel, frame);
    const shadow = dat.decode("shadow", seq, i);
    let shadowRef: Sprite["shadow"];
    if (shadow.width > 0) {
      await writeImg(`${rel}.shadow`, shadow);
      shadowRef = { path: `${rel}.shadow.png`, width: shadow.width, height: shadow.height, offsetX: shadow.offsetX, offsetY: shadow.offsetY };
    }
    added.push({
      id: `${group}/${pad(i)}`,
      category: "props",
      title: `stack ${material}`,
      subtitle: n > 1 ? `frame ${i + 1}/${n}` : "",
      tags: ["prop", `stack-${material}`],
      group,
      frame: i,
      frames: n,
      path: `${rel}.png`,
      shadow: shadowRef,
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
const drop = new Set(STACKS.map((s) => `props/stack-${s.material}`));
catalog.sprites = catalog.sprites.filter((s) => !drop.has(s.group ?? ""));
catalog.sprites.push(...added);
catalog.sprites.sort((a, b) => a.id.localeCompare(b.id));
await writeFile(catalogPath, JSON.stringify({ sprites: catalog.sprites }));
console.log(`catalog ${catalog.sprites.length} sprites`);
