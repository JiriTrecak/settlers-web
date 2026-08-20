/**
 * Dump named huts from buildings.json into `buildings/{civ}/{kind}` and patch catalog.json.
 * Full `dump:graphics` also writes these. Run: npm run dump:huts
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatArchive, parseDatFileName, type DecodedImage, type SeqKind } from "./dat";
import { encodePng } from "./png";
import type { BuildingEntry } from "./catalog/types";
import type { Sprite } from "./catalog/sprite";
import { ORIGINAL_GFX, REPO_ROOT } from "./original";

const OUT = join(REPO_ROOT, "assets/graphics");
const ONLY = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ["farm", "mill", "baker", "fisher", "pig_farm", "slaughterhouse", "waterworks"]);

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

async function writeImg(rel: string, img: DecodedImage): Promise<void> {
  if (img.width === 0 || img.height === 0) return;
  await mkdir(dirname(join(OUT, `${rel}.png`)), { recursive: true });
  await writeFile(join(OUT, `${rel}.png`), encodePng(img.width, img.height, img.rgba));
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

const buildingsJson = JSON.parse(await readFile(join(REPO_ROOT, "original_conv/catalog/buildings.json"), "utf8")) as {
  buildings: BuildingEntry[];
};
const wanted = buildingsJson.buildings.filter((b) => b.civ === "roman" && ONLY.has(b.building));
if (wanted.length === 0) {
  console.error(`no buildings matched ${[...ONLY].join(", ")}`);
  process.exit(1);
}

const catalogPath = join(OUT, "catalog.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as { sprites: Sprite[] };
const drop = new Set(wanted.map((b) => `buildings/${b.civ}/${b.building}`));
catalog.sprites = catalog.sprites.filter((s) => !drop.has(s.group ?? ""));

async function dumpRefs(
  b: BuildingEntry,
  refs: { file: number; kind: string; sequence: number; frame: number }[],
  state: string,
): Promise<void> {
  const many = refs.length > 1;
  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i]!;
    const dat = await archive(ref.file);
    if (!dat) continue;
    const kind = ref.kind as SeqKind;
    const img = dat.decode(kind, ref.sequence, ref.frame);
    if (img.width === 0) continue;
    const rel = `buildings/${b.civ}/${b.building}/${state}${many ? `/${pad(i)}` : ""}`;
    await writeImg(rel, img);
    const group = `buildings/${b.civ}/${b.building}`;
    catalog.sprites.push({
      id: `${b.id}/${state}${many ? `/${i}` : ""}`,
      category: "buildings",
      title: b.building.replace(/_/g, " "),
      subtitle: `${b.civ} · ${state}`,
      tags: ["building", b.civ, b.building, state],
      group,
      variant: state,
      frame: many ? i : undefined,
      frames: many ? refs.length : undefined,
      path: `${rel}.png`,
      width: img.width,
      height: img.height,
      offsetX: img.offsetX,
      offsetY: img.offsetY,
    });
  }
}

for (const b of wanted) {
  await rm(join(OUT, `buildings/${b.civ}/${b.building}`), { recursive: true, force: true });
  await dumpRefs(b, b.built, "built");
  await dumpRefs(b, b.scaffold, "scaffold");
  if (b.gui) await dumpRefs(b, [b.gui], "gui");
  console.log(`buildings/${b.civ}/${b.building}`);
}

catalog.sprites.sort((a, b) => a.id.localeCompare(b.id));
await writeFile(catalogPath, JSON.stringify({ sprites: catalog.sprites }));
console.log(`catalog ${catalog.sprites.length} sprites`);
