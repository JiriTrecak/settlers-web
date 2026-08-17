/**
 * One-shot: XML building files → `src/sim/data/buildings/*.ts`.
 * Runtime never reads XML. Re-run when adding a hut.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { REPO_ROOT } from "./original";

const XML_DIR = process.env.BUILDING_XML_DIR ?? join(REPO_ROOT, "original_conv/catalog/buildings/roman");
const OUT = join(REPO_ROOT, "src/sim/data/buildings");

const GROUND: Record<string, string> = {
  GRASS: "grass",
  EARTH: "earth",
  FLATTENED: "flattened",
};

const DIR: Record<string, string> = {
  NORTH_EAST: "ne",
  EAST: "e",
  SOUTH_EAST: "se",
  SOUTH_WEST: "sw",
  WEST: "w",
  NORTH_WEST: "nw",
};

const ONLY = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ["lumberjack", "tower", "sawmill", "small_livinghouse", "forester", "stonecutter"]);

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1]!] = m[2]!;
  return out;
}

function rel(a: Record<string, string>): string {
  return `{ dx: ${Number(a.dx)}, dy: ${Number(a.dy)} }`;
}

function parse(kind: string, xml: string): string {
  const open = xml.match(/<building\b([^>]*)>/);
  const a0 = open ? attrs(open[1]!) : {};
  const worker = a0.worker && a0.worker !== "" ? `"${a0.worker.toLowerCase()}"` : "null";
  const workRadius = Number(a0.workradius ?? 0);
  const viewDistance = Number(a0.viewdistance ?? 0);

  const ground: string[] = [];
  const blocked: string[] = [];
  const prot: string[] = [];
  const seen = new Set<string>();
  let door = "{ dx: 0, dy: 0 }";
  let flag = "{ dx: 0, dy: 0 }";
  const construction: string[] = [];
  const request: string[] = [];
  const offer: string[] = [];
  const brick: string[] = [];
  const marks: string[] = [];
  let workSpot = "";

  const tagRe = /<(\w+)([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml))) {
    const name = m[1]!;
    const a = attrs(m[2] ?? "");
    if (name === "ground") {
      const g = GROUND[a.groundtype ?? ""];
      if (g) ground.push(`"${g}"`);
    } else if (name === "blocked") {
      const key = `${a.dx},${a.dy}`;
      if (!seen.has(key)) {
        seen.add(key);
        prot.push(rel(a));
      }
      if (a.block !== "false") blocked.push(rel(a));
    } else if (name === "door") door = rel(a);
    else if (name === "flag") flag = rel(a);
    else if (name === "constructionStack") {
      construction.push(
        `{ dx: ${Number(a.dx)}, dy: ${Number(a.dy)}, material: "${(a.material ?? "").toLowerCase()}", required: ${Number(a.buildrequired)} }`,
      );
    } else if (name === "requestStack") {
      request.push(`{ dx: ${Number(a.dx)}, dy: ${Number(a.dy)}, material: "${(a.material ?? "").toLowerCase()}" }`);
    } else if (name === "offerStack") {
      offer.push(`{ dx: ${Number(a.dx)}, dy: ${Number(a.dy)}, material: "${(a.material ?? "").toLowerCase()}" }`);
    } else if (name === "bricklayer") {
      const d = DIR[a.direction ?? ""] ?? "e";
      brick.push(`{ dx: ${Number(a.dx)}, dy: ${Number(a.dy)}, direction: "${d}" }`);
    } else if (name === "buildmark") marks.push(rel(a));
    else if (name === "sawmillerWorkPosition") {
      const d = DIR[a.direction ?? ""] ?? "e";
      workSpot = `{ dx: ${Number(a.dx)}, dy: ${Number(a.dy)}, direction: "${d}" }`;
    }
  }

  if (!seen.has("0,0")) {
    prot.push("{ dx: 0, dy: 0 }");
    blocked.push("{ dx: 0, dy: 0 }");
  }

  const titles: Record<string, string> = {
    lumberjack: "Roman lumberjack hut. Trunk offer, work radius 30.",
    tower: "Roman tower. Placeable T1 occupy; also the match-start HQ.",
    sawmill: "Roman sawmill. Requests trunks, offers planks.",
    small_livinghouse: "Roman small house. Spawns 10 bearers.",
    forester: "Roman forester hut. Plants trees in work radius 18.",
    stonecutter: "Roman stonecutter hut. Stone offer, work radius 20.",
  };
  const extra: Record<string, string> = {
    small_livinghouse: "  beds: 10,\n  produceMs: 2000,\n",
  };

  return `/**
 * ${titles[kind] ?? `Roman ${kind}.`}
 */
import type { BuildingDef } from "../types";

export const ${kind.replace(/-/g, "_")} = {
  kind: "${kind}",
  civ: "roman",
  sheet: "buildings/roman/${kind}",
  worker: ${worker},
  workRadius: ${workRadius},
  viewDistance: ${viewDistance},
  ground: [${ground.join(", ")}],
  blocked: [
    ${blocked.join(",\n    ")}
  ],
  protected: [
    ${prot.join(",\n    ")}
  ],
  door: ${door},
  flag: ${flag},
  constructionStacks: [${construction.map((s) => `\n    ${s}`).join(",")}${construction.length ? "\n  " : ""}],
  requestStacks: [${request.map((s) => `\n    ${s}`).join(",")}${request.length ? "\n  " : ""}],
  offerStacks: [${offer.map((s) => `\n    ${s}`).join(",")}${offer.length ? "\n  " : ""}],
  bricklayers: [${brick.map((s) => `\n    ${s}`).join(",")}${brick.length ? "\n  " : ""}],
  buildMarks: [
    ${marks.join(",\n    ")}
  ],${workSpot ? `\n  workSpot: ${workSpot},` : ""}
${extra[kind] ?? ""}} as const satisfies BuildingDef;
`;
}

await mkdir(OUT, { recursive: true });
const names = (await readdir(XML_DIR)).filter((n) => n.endsWith(".xml"));
for (const name of names) {
  const kind = name.replace(/\.xml$/, "");
  if (!ONLY.has(kind)) continue;
  const xml = await readFile(join(XML_DIR, name), "utf8");
  await writeFile(join(OUT, `${kind}.ts`), parse(kind, xml));
  console.log(`wrote ${kind}`);
}
