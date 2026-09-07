/**
 * Play back Unity Nature materials on imported Synty glTFs.
 * FBX slots are Maya leftovers (lambert1 / Leave / Trunk). The look table is
 * prefab → non-LOD .mat, keyed by catalogue id. Leaf cards stay unlit so
 * cool world ambient doesn't muddy painted albedo. Rocks / swamp / grass
 * volumes use Lambert so they don't read as flat silhouettes.
 */
import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  type Material,
  type Object3D,
} from "three";
import looks from "../../../assets/synty/looks.json";

type SlotKind = "leaf" | "trunk" | "vine" | "dead" | "plant" | "atlas";
type SlotLook = {
  tint: [number, number, number];
  emit: [number, number, number];
  luma: boolean;
  vertex: boolean;
  flipV: boolean;
};
type AssetLook = Partial<Record<SlotKind, SlotLook>>;

const TABLE = looks as unknown as Record<string, AssetLook>;
const FALLBACK: SlotLook = { tint: [1, 1, 1], emit: [0, 0, 0], luma: false, vertex: false, flipV: false };
const lumaCache = new WeakMap<Texture, Texture>();

export function flattenPolygon(root: Object3D, hint = ""): void {
  const asset = TABLE[lookId(hint)];
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    const kinds = mats.map((mat) => kindOfGltf(mat.name ?? ""));
    if (kinds.some((k) => slotOf(asset, k).flipV)) flipLeafUv(node);
    const next = mats.map((mat, i) => asPainted(mat, slotOf(asset, kinds[i]!), kinds[i]!));
    node.material = Array.isArray(node.material) ? next : next[0]!;
  });
}

/** Leaf cards stay unlit (Unity tint). Volumes need Lambert or they read as flat decals. */
function asPainted(mat: Material, look: SlotLook, kind: SlotKind): Material {
  const src =
    mat instanceof MeshStandardMaterial || mat instanceof MeshLambertMaterial || mat instanceof MeshBasicMaterial
      ? mat
      : null;
  const card = kind === "leaf" || kind === "vine" || kind === "dead";
  const next = card ? new MeshBasicMaterial() : new MeshLambertMaterial();
  if (src) {
    next.map = src.map;
    next.transparent = src.transparent;
    next.opacity = src.opacity;
    next.alphaTest = src.alphaTest;
    next.side = src.side;
    next.depthWrite = src.depthWrite;
  }
  next.vertexColors = look.vertex;
  next.color.setRGB(...paint(look));
  if (next.map) {
    next.map = next.map.clone();
    next.map.wrapS = RepeatWrapping;
    next.map.wrapT = RepeatWrapping;
    next.map.needsUpdate = true;
  }
  if (look.luma && next.map) next.map = lumaOf(next.map);
  if (src) src.map = null;
  mat.dispose();
  return next;
}

/** Unlit stand-in for Unity `albedo × tint + emission`. */
function paint(look: SlotLook): [number, number, number] {
  return [
    Math.min(1, look.tint[0] + look.emit[0]),
    Math.min(1, look.tint[1] + look.emit[1]),
    Math.min(1, look.tint[2] + look.emit[2]),
  ];
}

function slotOf(asset: AssetLook | undefined, kind: SlotKind): SlotLook {
  if (!asset) return FALLBACK;
  return asset[kind] ?? (kind === "vine" ? asset.leaf : undefined) ?? asset.atlas ?? asset.plant ?? FALLBACK;
}

function kindOfGltf(name: string): SlotKind {
  const n = name.toLowerCase();
  // Maya leftover `lambert2` contains "leave" — that is not foliage.
  if (/lambert/.test(n)) return "atlas";
  if (/texture_0109/.test(n)) return "vine";
  if (/dead/.test(n) && /leave|leaf/.test(n)) return "dead";
  if (/leave|leaf/.test(n)) return "leaf";
  if (/trunk/.test(n)) return "trunk";
  return "atlas";
}

function lookId(hint: string): string {
  if (TABLE[hint]) return hint;
  const file = hint.split(/[\\/]/).pop() ?? hint;
  const id = file.replace(/\.gltf$/i, "").split("?")[0] ?? hint;
  if (TABLE[id]) return id;
  for (const key of Object.keys(TABLE).sort((a, b) => b.length - a.length)) {
    if (hint.includes(key)) return key;
  }
  return id;
}

/** Willow / vine cards share no verts with the trunk — flip V so strands hang. */
function flipLeafUv(node: Mesh): void {
  const list = Array.isArray(node.material) ? node.material : [node.material];
  const geo = node.geometry;
  const uv = geo.getAttribute("uv");
  if (!uv) return;
  const idx = geo.getIndex();
  const groups = geo.groups.length > 0 ? geo.groups : [{ start: 0, count: idx?.count ?? uv.count, materialIndex: 0 }];
  const seen = new Set<number>();
  for (const g of groups) {
    const mat = list[g.materialIndex ?? 0] ?? list[0];
    const kind = kindOfGltf(mat?.name ?? "");
    if (kind !== "leaf" && kind !== "vine") continue;
    if (idx) {
      for (let i = g.start; i < g.start + g.count; i++) {
        const vi = idx.getX(i);
        if (seen.has(vi)) continue;
        seen.add(vi);
        uv.setY(vi, 1 - uv.getY(vi));
      }
    } else {
      for (let i = g.start; i < g.start + g.count; i++) uv.setY(i, 1 - uv.getY(i));
    }
  }
  if (seen.size) uv.needsUpdate = true;
}

/** Olive leaf cards become a value map so a chromatic tint can be any hue. */
function lumaOf(tex: Texture): Texture {
  const hit = lumaCache.get(tex);
  if (hit) return hit;
  const next = bake(tex, (r, g, b) => {
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const v = 0.68 + 0.32 * y;
    return [v, v, v];
  });
  lumaCache.set(tex, next);
  return next;
}

function bake(tex: Texture, pix: (r: number, g: number, b: number) => [number, number, number]): Texture {
  const img = tex.image as { width?: number; height?: number } | undefined;
  const w = img?.width ?? 0;
  const h = img?.height ?? 0;
  if (!w || !h) return tex;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return tex;
  ctx.drawImage(img as CanvasImageSource, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    const [r, g, b] = pix(p[i]! / 255, p[i + 1]! / 255, p[i + 2]! / 255);
    p[i] = Math.round(r * 255);
    p[i + 1] = Math.round(g * 255);
    p[i + 2] = Math.round(b * 255);
  }
  ctx.putImageData(data, 0, 0);
  const next = new CanvasTexture(canvas);
  next.colorSpace = SRGBColorSpace;
  next.flipY = tex.flipY;
  next.wrapS = tex.wrapS;
  next.wrapT = tex.wrapT;
  next.magFilter = tex.magFilter;
  next.minFilter = tex.minFilter;
  next.needsUpdate = true;
  return next;
}
