/**
 * Pack DAT file 0 landscape frames into assets/graphics/landscape-atlas.png.
 * Also runs at the end of dump:graphics.
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatArchive, packLandscapeAtlas, parseDatFileName } from "../src/assets/dat";
import { encodePng } from "../src/assets/png";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GFX = join(ROOT, "GFX");
const OUT = join(ROOT, "assets/graphics/landscape-atlas.png");

if (!existsSync(GFX)) {
  console.error(`missing ${GFX}`);
  process.exit(1);
}

const names = (await readdir(GFX)).filter((n) => parseDatFileName(n));
let file: { name: string; color: "rgb555" | "rgb565" } | undefined;
for (const name of names) {
  const parsed = parseDatFileName(name)!;
  if (parsed.fileIndex !== 0) continue;
  if (file?.color === "rgb565" && parsed.color === "rgb555") continue;
  file = { name, color: parsed.color };
}
if (!file) {
  console.error("missing DAT file 0");
  process.exit(1);
}

const buf = await readFile(join(GFX, file.name));
const dat = new DatArchive(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), file.color, 0, file.name);
const n = dat.counts().landscape;
const tiles = Array.from({ length: n }, (_, i) => dat.decode("landscape", i, 0));
const atlas = packLandscapeAtlas(tiles);
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, encodePng(atlas.width, atlas.height, atlas.rgba));
console.log(`wrote ${OUT} (${n} tiles, ${atlas.width}x${atlas.height})`);
