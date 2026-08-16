/**
 * Convert original S3 maps into native JSON dumps + catalog.json.
 * Run: npm run dump:maps
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { MapCatalogEntry } from "../src/sim/map/dumpedMap";
import { parseOriginalMap } from "./map/parseOriginalMap";
import { toDumpedMap } from "./map/toNative";
import { originalMapDir, REPO_ROOT } from "./original";

const SRC = originalMapDir();
const OUT = join(REPO_ROOT, "assets/maps");

const GROUPS = [
  { dir: "TUTORIAL", group: "tutorial" as const },
  { dir: "SINGLE", group: "single" as const },
  { dir: "MULTI", group: "multi" as const },
];

function slug(rel: string): string {
  return rel
    .replace(/\\/g, "/")
    .replace(/\.map$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function prettyName(file: string): string {
  const base = file.replace(/\.map$/i, "");
  return base.replace(/^[MA]?\d+-\d+-/i, "").replace(/[_-]+/g, " ").trim() || base;
}

async function listMaps(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listMaps(abs)));
    else if (e.name.toLowerCase().endsWith(".map")) out.push(abs);
  }
  return out;
}

if (!existsSync(SRC)) {
  console.error(`missing ${SRC} — extract S3 first (original_conv/extract-s3.sh)`);
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
const catalog: MapCatalogEntry[] = [];

for (const { dir, group } of GROUPS) {
  const files = await listMaps(join(SRC, dir));
  files.sort((a, b) => a.localeCompare(b));
  for (const abs of files) {
    const rel = relative(join(SRC, dir), abs).replace(/\\/g, "/");
    const destRel = `${group}/${rel.replace(/\.map$/i, ".json")}`;
    const dest = join(OUT, destRel);
    await mkdir(dirname(dest), { recursive: true });
    try {
      const parsed = parseOriginalMap(await readFile(abs));
      const dumped = toDumpedMap(parsed);
      await writeFile(dest, JSON.stringify(dumped));
      catalog.push({
        id: slug(`${group}/${rel}`),
        name: prettyName(rel.split("/").pop()!),
        file: destRel,
        group,
        size: parsed.width,
        players: parsed.players.length,
        quest: parsed.quest.slice(0, 240),
      });
    } catch (err) {
      console.warn(`skip ${rel}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

const GROUP_ORDER = { tutorial: 0, single: 1, multi: 2 } as const;
catalog.sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || a.name.localeCompare(b.name));
await writeFile(join(OUT, "catalog.json"), JSON.stringify({ maps: catalog }, null, 2));
console.log(`wrote ${catalog.length} maps → ${OUT}`);
