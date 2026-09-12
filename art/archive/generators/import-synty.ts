/**
 * Converts Synty POLYGON Nature FBX (cm, HSV vertex tints + leaf atlases) into
 * catalog glTFs. Source FBX often collapses UVs to one atlas texel — those
 * meshes get box-projected UVs + tiling ground/grass maps. Skips skybox /
 * river planes. Full run wipes assets/synty except index.md.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BufferGeometry,
  Color,
  LoadingManager,
  Texture,
  type BufferAttribute,
  type InterleavedBufferAttribute,
  type Material,
  type Mesh,
  type Object3D,
} from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import {
  ASSET_CATEGORIES,
  parseCatalogue,
  stringifyCatalogue,
  type AssetCategory,
  type AssetType,
  type CatalogEntry,
} from "../src/shared/asset/catalog.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SRC = "/Users/jiritrecak/Downloads/Source Files";
const SCALE = 0.01;
const SRC = process.env.SYNTY_SRC ?? DEFAULT_SRC;
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("-"));

type MeshLike = Mesh & { isMesh?: boolean; geometry: BufferGeometry };

type MatSpec = {
  name: string;
  color: [number, number, number, number];
  tex?: string;
  cutout: boolean;
  authored: boolean;
};

type Prim = {
  position: Float32Array;
  normal: Float32Array;
  uv?: Float32Array;
  color?: Float32Array;
  colorSize: number;
  indices: Uint32Array;
  material: number;
};

function main(): void {
  const fbxDir = join(SRC, "FBX");
  const texDir = join(SRC, "Textures");
  const outDir = join(ROOT, "assets/synty");
  const texIndex = indexPngs(texDir);
  const manager = new LoadingManager();
  manager.addHandler(/\.(png|jpg|jpeg|tga)$/i, new FileTextureLoader(texIndex));
  const loader = new FBXLoader(manager);

  if (ONLY.length === 0) {
    mkdirSync(outDir, { recursive: true });
    for (const name of readdirSync(outDir)) {
      if (name === "index.md") continue;
      rmSync(join(outDir, name), { recursive: true, force: true });
    }
  }
  mkdirSync(outDir, { recursive: true });

  const files = readdirSync(fbxDir)
    .filter((f) => f.toLowerCase().endsWith(".fbx") && keepFbx(f))
    .filter((f) => (ONLY.length === 0 ? true : ONLY.some((q) => f.toLowerCase().includes(q.toLowerCase()))))
    .sort();

  const added: CatalogEntry[] = [];
  let ok = 0;
  for (const file of files) {
    const stem = file.replace(/\.fbx$/i, "");
    const id = idFromStem(stem);
    try {
      const buf = readFileSync(join(fbxDir, file));
      const group = loader.parse(asAb(buf), `${texDir}/`);
      group.scale.setScalar(SCALE);
      group.updateMatrixWorld(true);
      const used = writeGltf(join(outDir, `${id}.gltf`), stem, group, texIndex);
      const { type, category } = classify(stem);
      added.push({ id, name: displayName(stem), category, type, file: `synty/${id}.gltf` });
      ok += 1;
      const note = used.length ? ` tex=${used.join(",")}` : "";
      console.log(`ok ${id}${note}`);
    } catch (err) {
      console.error(`fail ${stem}`, err);
    }
  }

  if (ONLY.length === 0) patchCatalogue(added);
  console.log(`wrote ${ok}/${files.length} → assets/synty`);
}

function keepFbx(file: string): boolean {
  return /^SM_/i.test(file);
}

function idFromStem(stem: string): string {
  return `synty-${stem.replace(/^SM_/i, "").replace(/_/g, "-").toLowerCase()}`;
}

const BIRCH_NAME: Record<string, string> = {
  SM_Tree_Birch_01: "Tree Birch Gold",
  SM_Tree_Birch_02: "Tree Birch Autumn",
  SM_Tree_Birch_03: "Tree Birch Crimson",
  SM_Tree_Birch_04: "Tree Birch Lime",
};

function displayName(stem: string): string {
  return BIRCH_NAME[stem] ?? stem.replace(/^SM_/i, "").replace(/_/g, " ");
}

function classify(stem: string): { type: AssetType; category: AssetCategory } {
  const n = stem.toLowerCase();
  if (n.includes("lillypad") || n.includes("lilypad") || n.includes("reeds")) {
    return { type: "water", category: "water" };
  }
  if (n.includes("bridge")) return { type: "span", category: "landmark" };
  if (n.includes("cloud")) return { type: "prop", category: "other" };
  if (n.includes("_tree_") || n.includes("_plant_") || n.includes("_swamp_")) {
    return { type: "prop", category: "foliage" };
  }
  if (n.includes("_rock_") || n.includes("_terrain_")) return { type: "prop", category: "terrain" };
  if (n.includes("_prop_")) return { type: "prop", category: "landmark" };
  return { type: "prop", category: "other" };
}

function writeGltf(out: string, stem: string, root: Object3D, texIndex: Map<string, string>): string[] {
  const mats: MatSpec[] = [];
  const prims: Prim[] = [];
  const used = new Set<string>();
  root.traverse((node) => {
    if (!isMesh(node) || /lod/i.test(node.name)) return;
    const geo = node.geometry.clone();
    geo.applyMatrix4(node.matrixWorld);
    if (!geo.getAttribute("normal")) geo.computeVertexNormals();
    const pos = float3(geo.getAttribute("position"));
    const nor = float3(geo.getAttribute("normal"));
    if (!pos || !nor || pos.length < 3) return;
    let uv = float2(geo.getAttribute("uv"));
    const col = floatColor(geo.getAttribute("color"));
    const idx = indicesOf(geo);
    const list = Array.isArray(node.material) ? node.material : [node.material];
    const groups = geo.groups.length > 0 ? geo.groups : [{ start: 0, count: idx.length, materialIndex: 0 }];
    for (const g of groups) {
      if (g.count <= 0) continue;
      const src = list[g.materialIndex] ?? list[0];
      if (!src) continue;
      const spec = materialOf(src, stem, texIndex);
      // Source FBX often stores a single UV (rocks, swamp, grass). Atlas × that is a flat blob.
      if (!uv || uvSpan(uv) < 0.02) {
        uv = projectUv(pos, nor);
        const tile = tilingTex(stem, texIndex);
        if (tile) spec.tex = tile;
        else spec.tex = undefined;
      }
      // FBX rarely embeds the Unity atlas. UVs still point at PolygonNature / leaf sheets.
      if (!spec.tex && uv && !/cloud/i.test(stem)) {
        spec.tex = fallbackTex(src.name ?? "", stem, texIndex) ?? texIndex.get("polygonnature_01.png");
      }
      // Unity Lambert default is 0.6 gray. Atlas × that is mud (chest, swamp).
      if (spec.tex) spec.color = [1, 1, 1, spec.color[3] ?? 1];
      // Synty paints hue in R and sat in B (G ≈ 0). Raw RGB looks magenta; decode to linear RGB.
      const tint = col ? { data: decodeSyntyColor(col.data, col.size), size: col.size } : undefined;
      if (tint) spec.color = [1, 1, 1, 1];
      if (spec.tex) used.add(spec.tex.split(/[\\/]/).pop() ?? spec.tex);
      let mi = mats.findIndex((m) => sameMat(m, spec));
      if (mi < 0) {
        mi = mats.length;
        mats.push(spec);
      }
      prims.push({
        position: pos,
        normal: nor,
        uv,
        color: tint?.data,
        colorSize: tint?.size ?? 0,
        indices: idx.subarray(g.start, g.start + g.count),
        material: mi,
      });
    }
  });
  if (prims.length === 0) throw new Error("no mesh");
  writeFileSync(out, JSON.stringify(packGltf(stem, prims, mats)));
  return [...used];
}

function materialOf(mat: Material, stem: string, texIndex: Map<string, string>): MatSpec {
  const any = mat as Material & { color?: Color; opacity?: number; map?: Texture | null; name?: string };
  const fromFbx = any.map?.userData.sourceFile as string | undefined;
  const named = fromFbx ?? fallbackTex(any.name ?? "", stem, texIndex);
  const cutout = isCutout(any.name ?? "", named);
  const c = any.color ?? new Color(1, 1, 1);
  return {
    name: any.name || "mat",
    color: [c.r, c.g, c.b, any.opacity ?? 1],
    tex: named,
    cutout,
    authored: Boolean(fromFbx),
  };
}

function fallbackTex(matName: string, stem: string, texIndex: Map<string, string>): string | undefined {
  const n = `${matName} ${stem}`.toLowerCase();
  if (/fern/.test(n)) return texIndex.get("fern_texture.png");
  if (/willow/.test(n) && /leave|leaf/.test(n)) return texIndex.get("leaves_willow_texture.png");
  if (/pine/.test(n) && /leave|leaf/.test(n)) return texIndex.get("leaves_pine_texture.png");
  if (/dead/.test(n) && /leave|leaf|branch/.test(n)) return texIndex.get("tree_dead_branch.png");
  if (/birch/.test(n) && /trunk/.test(n)) return texIndex.get("birch_trunk_texture.png");
  if (/flowerbush|flower_bush/.test(n)) return texIndex.get("flowerbush_texture.png");
  if (/undergrowth/.test(n)) return texIndex.get("undergrowth_texture.png");
  if (/reed/.test(n)) return texIndex.get("reeds.png");
  if (/leave|leaf/.test(n)) return texIndex.get("leaves_generic_texture.png");
  return tilingTex(stem, texIndex) ?? texIndex.get("polygonnature_01.png");
}

/** Tiling ground/grass for meshes whose Source FBX has a collapsed UV. */
function tilingTex(stem: string, texIndex: Map<string, string>): string | undefined {
  const n = stem.toLowerCase();
  if (/cloud/.test(n)) return undefined;
  if (/ice|snow/.test(n)) return texIndex.get("snow.png");
  if (/vine/.test(n)) return texIndex.get("leaves_generic_texture.png");
  if (/reed/.test(n)) return texIndex.get("reeds.png");
  if (/grass|hedge|wheat/.test(n)) return texIndex.get("grass.png");
  if (/swamp_growth/.test(n)) return texIndex.get("moss.png");
  if (/swamp_root|twig|branch|root/.test(n))
    return texIndex.get("birch_trunk_texture.png") ?? texIndex.get("rockwall.png");
  if (/fence/.test(n)) return texIndex.get("mud.png");
  if (/dust|mound|dirt|mud/.test(n)) return texIndex.get("mud.png");
  if (/pebble|rubble|sand/.test(n)) return texIndex.get("pebbles.png");
  if (/rock|cave|boulder|mountain|cliff|stone|wall/.test(n)) return texIndex.get("rockwall.png");
  if (/plant/.test(n)) return texIndex.get("grass.png");
  return texIndex.get("rockwall.png");
}

function uvSpan(uv: Float32Array): number {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < uv.length; i += 2) {
    minU = Math.min(minU, uv[i]!);
    maxU = Math.max(maxU, uv[i]!);
    minV = Math.min(minV, uv[i + 1]!);
    maxV = Math.max(maxV, uv[i + 1]!);
  }
  return Math.max(maxU - minU, maxV - minV);
}

/**
 * Box-project UVs. World-meter tiling made Rockwall read as static on 13 m
 * clusters — Synty paints ~one atlas of facets per prop, so we normalize
 * the longest axis to ~1.1 UV.
 */
function projectUv(pos: Float32Array, nor: Float32Array): Float32Array {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    minX = Math.min(minX, pos[i]!);
    maxX = Math.max(maxX, pos[i]!);
    minY = Math.min(minY, pos[i + 1]!);
    maxY = Math.max(maxY, pos[i + 1]!);
    minZ = Math.min(minZ, pos[i + 2]!);
    maxZ = Math.max(maxZ, pos[i + 2]!);
  }
  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.35);
  const t = 1.1 / extent;
  const out = new Float32Array((pos.length / 3) * 2);
  for (let i = 0, o = 0; i < pos.length; i += 3, o += 2) {
    const nx = Math.abs(nor[i]!);
    const ny = Math.abs(nor[i + 1]!);
    const nz = Math.abs(nor[i + 2]!);
    const x = pos[i]!;
    const y = pos[i + 1]!;
    const z = pos[i + 2]!;
    if (ny >= nx && ny >= nz) {
      out[o] = x * t;
      out[o + 1] = z * t;
    } else if (nx >= nz) {
      out[o] = z * t;
      out[o + 1] = y * t;
    } else {
      out[o] = x * t;
      out[o + 1] = y * t;
    }
  }
  return out;
}

function isCutout(matName: string, tex?: string): boolean {
  const s = `${matName} ${tex ?? ""}`.toLowerCase();
  return /leave|leaf|fern|reed|flowerbush|flowerpatch|undergrowth|grass|moss|vine/.test(s);
}

function sameMat(a: MatSpec, b: MatSpec): boolean {
  return (
    a.name === b.name &&
    a.tex === b.tex &&
    a.cutout === b.cutout &&
    a.authored === b.authored &&
    a.color.every((v, i) => v === b.color[i])
  );
}

function packGltf(name: string, prims: Prim[], mats: MatSpec[]): object {
  const images: { uri: string }[] = [];
  const textures: { source: number }[] = [];
  const texSlot = new Map<string, number>();
  const materials = mats.map((m) => {
    const pbr: Record<string, unknown> = {
      baseColorFactor: m.color,
      metallicFactor: 0,
      roughnessFactor: 0.86,
    };
    if (m.tex) {
      let slot = texSlot.get(m.tex);
      if (slot === undefined) {
        slot = images.length;
        const bytes = readFileSync(m.tex);
        images.push({ uri: `data:image/png;base64,${bytes.toString("base64")}` });
        textures.push({ source: slot, sampler: 0 });
        texSlot.set(m.tex, slot);
      }
      pbr.baseColorTexture = { index: slot };
    }
    return {
      name: m.name,
      pbrMetallicRoughness: pbr,
      doubleSided: m.cutout,
      ...(m.cutout ? { alphaMode: "MASK", alphaCutoff: 0.4 } : {}),
    };
  });

  const binParts: Buffer[] = [];
  let binSize = 0;
  const accessors: object[] = [];
  const bufferViews: object[] = [];
  const primitives: object[] = [];

  const addView = (bytes: Buffer, target?: number): number => {
    const pad = (4 - (binSize % 4)) % 4;
    if (pad) {
      binParts.push(Buffer.alloc(pad));
      binSize += pad;
    }
    const offset = binSize;
    binParts.push(bytes);
    binSize += bytes.length;
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) });
    return bufferViews.length - 1;
  };

  const addF32 = (data: Float32Array, type: "VEC2" | "VEC3" | "VEC4", min?: number[], max?: number[]): number => {
    const view = addView(Buffer.from(data.buffer, data.byteOffset, data.byteLength), 34962);
    accessors.push({ bufferView: view, componentType: 5126, count: data.length / comps(type), type, ...(min ? { min, max } : {}) });
    return accessors.length - 1;
  };

  for (const prim of prims) {
    const { min, max } = bounds(prim.position);
    const attr: Record<string, number> = {
      POSITION: addF32(prim.position, "VEC3", min, max),
      NORMAL: addF32(prim.normal, "VEC3"),
    };
    if (prim.uv) attr.TEXCOORD_0 = addF32(prim.uv, "VEC2");
    if (prim.color) attr.COLOR_0 = addF32(prim.color, prim.colorSize === 4 ? "VEC4" : "VEC3");
    const maxIx = prim.indices.reduce((a, b) => Math.max(a, b), 0);
    const idxBuf = maxIx > 65535 ? Buffer.from(prim.indices.buffer, prim.indices.byteOffset, prim.indices.byteLength) : u16(prim.indices);
    const idxView = addView(idxBuf, 34963);
    accessors.push({
      bufferView: idxView,
      componentType: maxIx > 65535 ? 5125 : 5123,
      count: prim.indices.length,
      type: "SCALAR",
    });
    primitives.push({ attributes: attr, indices: accessors.length - 1, material: prim.material });
  }

  const bin = Buffer.concat(binParts, binSize);
  return {
    asset: { version: "2.0", generator: "utc-import-synty" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives }],
    materials,
    ...(images.length ? { images, textures, samplers: [{ wrapS: 10497, wrapT: 10497 }] } : {}),
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length, uri: `data:application/octet-stream;base64,${bin.toString("base64")}` }],
  };
}

function comps(type: "VEC2" | "VEC3" | "VEC4"): number {
  return type === "VEC2" ? 2 : type === "VEC3" ? 3 : 4;
}

function bounds(pos: Float32Array): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    min[0] = Math.min(min[0]!, pos[i]!);
    min[1] = Math.min(min[1]!, pos[i + 1]!);
    min[2] = Math.min(min[2]!, pos[i + 2]!);
    max[0] = Math.max(max[0]!, pos[i]!);
    max[1] = Math.max(max[1]!, pos[i + 1]!);
    max[2] = Math.max(max[2]!, pos[i + 2]!);
  }
  return { min, max };
}

function u16(idx: Uint32Array): Buffer {
  const out = Buffer.alloc(idx.length * 2);
  for (let i = 0; i < idx.length; i++) out.writeUInt16LE(idx[i]!, i * 2);
  return out;
}

function float3(attr: BufferAttribute | InterleavedBufferAttribute | undefined): Float32Array | undefined {
  if (!attr) return undefined;
  const n = attr.count;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = attr.getX(i);
    out[i * 3 + 1] = attr.getY(i);
    out[i * 3 + 2] = attr.getZ(i);
  }
  return out;
}

function float2(attr: BufferAttribute | InterleavedBufferAttribute | undefined): Float32Array | undefined {
  if (!attr) return undefined;
  const n = attr.count;
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[i * 2] = attr.getX(i);
    out[i * 2 + 1] = attr.getY(i);
  }
  return out;
}

/** Synty POLYGON: (R, 0, B) is HSV(h=R, s=B, v=1), not an RGB tint. */
function decodeSyntyColor(data: Float32Array, size: number): Float32Array {
  let gMax = 0;
  const n = data.length / size;
  for (let i = 0; i < n; i++) gMax = Math.max(gMax, data[i * size + 1]!);
  if (gMax > 0.04) return data;
  const out = new Float32Array(data.length);
  for (let i = 0; i < n; i++) {
    const [r, g, b] = hsvToRgb(data[i * size]!, clamp01(data[i * size + 2]!), 1);
    out[i * size] = srgbToLinear(r);
    out[i * size + 1] = srgbToLinear(g);
    out[i * size + 2] = srgbToLinear(b);
    if (size === 4) out[i * size + 3] = data[i * size + 3]!;
  }
  return out;
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function floatColor(attr: BufferAttribute | InterleavedBufferAttribute | undefined): { data: Float32Array; size: number } | undefined {
  if (!attr) return undefined;
  const size = attr.itemSize >= 4 ? 4 : 3;
  const n = attr.count;
  const out = new Float32Array(n * size);
  for (let i = 0; i < n; i++) {
    out[i * size] = attr.getX(i);
    out[i * size + 1] = attr.getY(i);
    out[i * size + 2] = attr.getZ(i);
    if (size === 4) out[i * size + 3] = attr.getW(i);
  }
  return { data: out, size };
}

function indicesOf(geo: BufferGeometry): Uint32Array {
  const idx = geo.getIndex();
  if (idx) {
    const out = new Uint32Array(idx.count);
    for (let i = 0; i < idx.count; i++) out[i] = idx.getX(i);
    return out;
  }
  const n = geo.getAttribute("position")?.count ?? 0;
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = i;
  return out;
}

function isMesh(node: Object3D): node is MeshLike {
  return Boolean((node as MeshLike).isMesh && (node as MeshLike).geometry);
}

function asAb(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function indexPngs(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (name.name.startsWith(".") || name.name === ".mayaSwatches") continue;
      const path = join(dir, name.name);
      if (name.isDirectory()) walk(path);
      else if (/\.png$/i.test(name.name)) out.set(name.name.toLowerCase(), path);
    }
  };
  walk(root);
  return out;
}

function patchCatalogue(synty: CatalogEntry[]): void {
  const path = join(ROOT, "assets/catalog.json");
  const doc = parseCatalogue(JSON.parse(readFileSync(path, "utf8")));
  if (!doc) throw new Error("assets/catalog.json is invalid");
  const kept = doc.assets.filter((a) => !a.id.startsWith("synty-"));
  const rank = new Map(ASSET_CATEGORIES.map((c, i) => [c, i]));
  const extra = [...synty].sort((a, b) => {
    const d = (rank.get(a.category) ?? 99) - (rank.get(b.category) ?? 99);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
  writeFileSync(path, stringifyCatalogue({ ...doc, assets: [...kept, ...extra] }));
}

class FileTextureLoader {
  path = "";

  constructor(private readonly index: Map<string, string>) {}

  setPath(path?: string): this {
    this.path = path ?? "";
    return this;
  }

  setCrossOrigin(): this {
    return this;
  }

  load(url: string, onLoad?: (tex: Texture) => void): Texture {
    const name = url.split(/[\\/]/).pop() ?? url;
    const tex = new Texture();
    tex.name = name;
    tex.userData.sourceFile = this.index.get(name.toLowerCase());
    queueMicrotask(() => onLoad?.(tex));
    return tex;
  }
}

main();
