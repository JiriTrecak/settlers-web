import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const javaBuildings = join(
  root,
  "../SettlersJava/jsettlers.common/src/main/resources/jsettlers/common/buildings",
);
const out = join(root, "src/assets/catalog/buildings.json");

const civs = ["roman", "egyptian", "asian", "amazon"];
const imgRe = /<image\b([^>]*)\/?>/gi;
const attrRe = /(\w+)="([^"]*)"/g;

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(attrRe)) out[m[1]] = m[2];
  return out;
}

function refFrom(a) {
  const type = (a.type ?? "SETTLER").toLowerCase();
  const kind = type === "gui" ? "gui" : type === "landscape" ? "landscape" : "settler";
  return {
    file: Number(a.file ?? 0),
    kind,
    sequence: Number(a.sequence ?? 0),
    frame: Number(a.image ?? 0),
  };
}

const entries = [];
for (const civ of civs) {
  const dir = join(javaBuildings, civ);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".xml")).sort();
  for (const file of files) {
    const building = file.replace(/\.xml$/, "");
    const xml = await readFile(join(dir, file), "utf8");
    const built = [];
    const scaffold = [];
    let gui = null;
    for (const m of xml.matchAll(imgRe)) {
      const a = attrs(m[1]);
      const ref = refFrom(a);
      const dest = (a.for ?? "FINAL").toUpperCase();
      if (dest === "GUI") gui = ref;
      else if (dest === "BUILD") scaffold.push(ref);
      else built.push(ref);
    }
    entries.push({
      id: `building/${civ}/${building}`,
      civ,
      building,
      built,
      scaffold,
      gui,
    });
  }
}

await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({ buildings: entries }, null, 2) + "\n");
console.log(`wrote ${entries.length} buildings`);
