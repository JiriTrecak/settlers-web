/**
 * Indexes the Unity Nature cache and writes the look table every Synty glTF
 * slot plays back: prefab → non-LOD mats → catalog id.
 *
 *   SYNTY_UNITY=... tsx scripts/unity-nature.ts
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCatalogue } from "../src/shared/asset/catalog.ts";

/** Catalogue names that are Demo-scene mat swaps, not the default prefab. */
const COLORWAY: Record<string, string> = {
  "synty-tree-birch-01": "Leaves_01_Pink",
  "synty-tree-birch-02": "Leaves_01_Yellow",
  "synty-tree-birch-03": "Leaves_01_Brown",
  "synty-tree-birch-04": "Leaves_Pine_01_BrightGreen",
  "synty-tree-birch-small-01": "Leaves_Pine_01_BrightGreen",
  "synty-tree-willow-large-01": "Leaves_Willow_01_Pink",
  "synty-tree-pine-02": "Leaves_Pine_01_Brown",
  "synty-tree-pine-large-02": "Leaves_Pine_01_Brown",
};

const ROOT =
  process.env.SYNTY_UNITY ?? "/Users/jiritrecak/Downloads/POLYGON_Nature_Unity_2022_3_v1_2_1";
const HERE = dirname(fileURLToPath(import.meta.url));
const DUMP = join(HERE, "../tmp/synty-unity.json");
const LOOKS = join(HERE, "../assets/synty/looks.json");

type Rec = { folder: string; guid: string; path: string; asset: string };
type SlotKind = "leaf" | "trunk" | "vine" | "dead" | "plant" | "atlas";
type SlotLook = {
  tint: [number, number, number];
  emit: [number, number, number];
  luma: boolean;
  vertex: boolean;
  flipV: boolean;
};
type AssetLook = Partial<Record<SlotKind, SlotLook>>;

function main(): void {
  const { byPath, byGuid } = index(ROOT);
  const mats = [...byPath.values()]
    .filter((r) => r.path.endsWith(".mat"))
    .map((r) => parseMat(r, byGuid));
  const matByPath = new Map(mats.map((m) => [m.path, m]));
  const prefabs = [...byPath.values()]
    .filter((r) => r.path.endsWith(".prefab") && /PolygonNature\/Prefabs/i.test(r.path))
    .map((r) => parsePrefab(r, byGuid));

  const catalog = parseCatalogue(JSON.parse(readFileSync(join(HERE, "../assets/catalog.json"), "utf8")));
  if (!catalog) throw new Error("assets/catalog.json invalid");

  const looks: Record<string, AssetLook> = {};
  let hit = 0;
  for (const entry of catalog.assets) {
    if (!entry.id.startsWith("synty-")) continue;
    const prefab = prefabs.find((p) => p.meshes.some((m) => norm(m) === normFbx(entry.id)));
    const look = lookFromMats((prefab?.mats ?? []).map((p) => matByPath.get(p)).filter(Boolean) as Mat[]);
    const swap = COLORWAY[entry.id];
    if (swap) {
      const mat = mats.find((m) => m.name === swap);
      if (mat) look.leaf = slotLook(mat, "leaf");
    }
    if (Object.keys(look).length) {
      looks[entry.id] = look;
      hit += 1;
    }
  }

  mkdirSync(dirname(LOOKS), { recursive: true });
  writeFileSync(LOOKS, `${JSON.stringify(looks, null, 2)}\n`);
  mkdirSync(dirname(DUMP), { recursive: true });
  writeFileSync(DUMP, `${JSON.stringify({ root: ROOT, mats, prefabs }, null, 2)}\n`);
  console.log(`looks ${hit}/${catalog.assets.filter((a) => a.id.startsWith("synty-")).length} → ${LOOKS}`);
}

function lookFromMats(mats: Mat[]): AssetLook {
  const look: AssetLook = {};
  const ranked = mats
    .filter((m) => !/\/LODS\//i.test(m.path) && !/_LOD_/i.test(m.name))
    .concat(mats.filter((m) => /\/LODS\//i.test(m.path) || /_LOD_/i.test(m.name)));
  for (const mat of ranked) {
    const kind = kindOfMat(mat);
    if (look[kind]) continue;
    look[kind] = slotLook(mat, kind);
  }
  return look;
}

function kindOfMat(mat: Mat): SlotKind {
  const n = mat.name.toLowerCase();
  if (/vine/.test(n)) return "vine";
  if (/trunk/.test(n)) return "trunk";
  if (/dead/.test(n)) return "dead";
  if (/willow/.test(n) && /leave/.test(n)) return "leaf";
  if (/leave|fern|flower/.test(n)) return "leaf";
  if (/plant/.test(n)) return "plant";
  return "atlas";
}

function slotLook(mat: Mat, kind: SlotKind): SlotLook {
  const tint = mat.tint ?? mat.color ?? [1, 1, 1];
  const emit = mat.emit ?? [0, 0, 0];
  const color = mat.color ?? [1, 1, 1];
  const tree = /Trees|Vines|LOD/i.test(mat.shader ?? "");
  const gray = almostGray(color) && color[0] > 0.45 && color[0] < 0.7;
  const dark = !tree && (color[0] + color[1] + color[2]) / 3 < 0.35;
  const base = tree ? tint : gray || dark ? [1, 1, 1] : color;
  const chroma = Math.max(base[0], base[1], base[2]) - Math.min(base[0], base[1], base[2]);
  return {
    tint: [clamp01(base[0]!), clamp01(base[1]!), clamp01(base[2]!)],
    emit: [clamp01(emit[0]!), clamp01(emit[1]!), clamp01(emit[2]!)],
    luma: tree && chroma > 0.15 && kind !== "trunk",
    vertex: kind === "leaf" || kind === "vine" || kind === "plant",
    flipV: kind === "vine" || (kind === "leaf" && /willow/i.test(mat.name)),
  };
}

function almostGray(c: [number, number, number]): boolean {
  return Math.abs(c[0] - c[1]) < 0.04 && Math.abs(c[1] - c[2]) < 0.04;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\.fbx$/i, "").replace(/[^a-z0-9]/g, "");
}

function normFbx(id: string): string {
  return norm(`SM_${id.replace(/^synty-/, "").replace(/-/g, "_")}`);
}

type Mat = {
  path: string;
  name: string;
  guid: string;
  shader?: string;
  tint?: [number, number, number];
  emit?: [number, number, number];
  color?: [number, number, number];
};

function index(root: string): { byPath: Map<string, Rec>; byGuid: Map<string, Rec> } {
  const byPath = new Map<string, Rec>();
  const byGuid = new Map<string, Rec>();
  for (const name of readdirSync(root)) {
    const dir = join(root, name);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    let path: string;
    try {
      path = readFileSync(join(dir, "pathname"), "utf8").trim().replace(/\\/g, "/");
    } catch {
      continue;
    }
    let guid = name;
    try {
      const g = readFileSync(join(dir, "asset.meta"), "utf8").match(/^guid:\s*([a-f0-9]+)/m);
      if (g) guid = g[1]!;
    } catch {
      /* folder name is the cache key */
    }
    const rec = { folder: name, guid, path, asset: join(dir, "asset") };
    byPath.set(path, rec);
    byGuid.set(guid, rec);
  }
  return { byPath, byGuid };
}

function parseMat(rec: Rec, byGuid: Map<string, Rec>): Mat {
  const text = readFileSync(rec.asset, "utf8");
  const shaderGuid = text.match(/m_Shader:.*guid:\s*([a-f0-9]+)/)?.[1];
  return {
    path: rec.path,
    name: rec.path.split("/").pop()?.replace(/\.mat$/i, "") ?? rec.path,
    guid: rec.guid,
    shader: shaderGuid ? byGuid.get(shaderGuid)?.path : undefined,
    tint: color(text, "_Color_Tint") ?? color(text, "_ColorTint"),
    emit: color(text, "_Emission_Color") ?? color(text, "_EmissionColor"),
    color: color(text, "_Color"),
  };
}

function parsePrefab(rec: Rec, byGuid: Map<string, Rec>) {
  const text = readFileSync(rec.asset, "utf8");
  const mats: string[] = [];
  const meshes: string[] = [];
  for (const m of text.matchAll(/guid:\s*([a-f0-9]{32})/g)) {
    const hit = byGuid.get(m[1]!);
    if (!hit) continue;
    if (hit.path.endsWith(".mat") && !mats.includes(hit.path)) mats.push(hit.path);
    if (/\.(fbx|obj)$/i.test(hit.path) && !meshes.includes(hit.path.split("/").pop()!)) {
      meshes.push(hit.path.split("/").pop()!);
    }
  }
  return { path: rec.path, guid: rec.guid, mats, meshes };
}

function color(text: string, key: string): [number, number, number] | undefined {
  const m = text.match(new RegExp(`${key}:\\s*\\{r:\\s*([-\\d.eE]+),\\s*g:\\s*([-\\d.eE]+),\\s*b:\\s*([-\\d.eE]+)`));
  if (!m) return undefined;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

main();
