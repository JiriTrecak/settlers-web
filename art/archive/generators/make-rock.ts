/**
 * Writes three block-sized rocks (~16 cells across) to assets/props/rock*.gltf.
 * Sit-on-ground blobs: displaced icosphere, flattened base, lichen on the crown.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SPAN = 16;
const SUBDIV = 3;

type Spec = {
  file: string;
  stone: readonly [number, number, number];
  lichen: readonly [number, number, number];
  blobs: readonly { cx: number; cy: number; cz: number; rx: number; ry: number; rz: number }[];
  warp: number;
  seed: number;
};

const SPECS: readonly Spec[] = [
  {
    file: "rock.gltf",
    stone: [0.48, 0.44, 0.38],
    lichen: [0.3, 0.38, 0.26],
    blobs: [{ cx: 0, cy: 0.6, cz: 0, rx: 7.4, ry: 4.6, rz: 6.6 }],
    warp: 0.22,
    seed: 11,
  },
  {
    file: "rock-cleft.gltf",
    stone: [0.4, 0.38, 0.34],
    lichen: [0.26, 0.34, 0.24],
    blobs: [
      { cx: -2.4, cy: 0.5, cz: -0.2, rx: 5.8, ry: 4.4, rz: 5.2 },
      { cx: 2.6, cy: 0.35, cz: 0.4, rx: 5.4, ry: 3.9, rz: 4.9 },
    ],
    warp: 0.18,
    seed: 29,
  },
  {
    file: "rock-slab.gltf",
    stone: [0.52, 0.44, 0.34],
    lichen: [0.34, 0.36, 0.22],
    blobs: [{ cx: 0, cy: 0.15, cz: 0, rx: 8.1, ry: 2.15, rz: 7.2 }],
    warp: 0.14,
    seed: 47,
  },
];

type Vec = { x: number; y: number; z: number };

function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function mul(a: Vec, s: number): Vec {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function len(v: Vec): number {
  return Math.hypot(v.x, v.y, v.z);
}

function norm(v: Vec): Vec {
  const n = len(v) || 1;
  return { x: v.x / n, y: v.y / n, z: v.z / n };
}

function hash(ix: number, iy: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + iz * 1274126177 + seed * 1103515245) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h >>> 0) / 4294967296;
}

function noise(p: Vec, seed: number): number {
  const x0 = Math.floor(p.x);
  const y0 = Math.floor(p.y);
  const z0 = Math.floor(p.z);
  const fx = p.x - x0;
  const fy = p.y - y0;
  const fz = p.z - z0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  let acc = 0;
  for (let dz = 0; dz <= 1; dz++) {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const w = (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
        acc += hash(x0 + dx, y0 + dy, z0 + dz, seed) * w;
      }
    }
  }
  return acc * 2 - 1;
}

function fbm(p: Vec, seed: number): number {
  return noise(p, seed) * 0.62 + noise(mul(p, 2.15), seed + 17) * 0.28 + noise(mul(p, 4.4), seed + 41) * 0.1;
}

function icosphere(level: number): { verts: Vec[]; faces: [number, number, number][] } {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: Vec[] = [
    { x: -1, y: t, z: 0 },
    { x: 1, y: t, z: 0 },
    { x: -1, y: -t, z: 0 },
    { x: 1, y: -t, z: 0 },
    { x: 0, y: -1, z: t },
    { x: 0, y: 1, z: t },
    { x: 0, y: -1, z: -t },
    { x: 0, y: 1, z: -t },
    { x: t, y: 0, z: -1 },
    { x: t, y: 0, z: 1 },
    { x: -t, y: 0, z: -1 },
    { x: -t, y: 0, z: 1 },
  ].map(norm);
  let faces: [number, number, number][] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  const verts = raw.slice();
  const mid = new Map<string, number>();
  const edge = (a: number, b: number): number => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    const hit = mid.get(key);
    if (hit !== undefined) return hit;
    const i = verts.length;
    verts.push(norm(add(verts[a]!, verts[b]!)));
    mid.set(key, i);
    return i;
  };
  for (let s = 0; s < level; s++) {
    const next: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = edge(a, b);
      const bc = edge(b, c);
      const ca = edge(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
    mid.clear();
  }
  return { verts, faces };
}

function onBlob(dir: Vec, blob: Spec["blobs"][number]): Vec {
  const q = {
    x: (dir.x * blob.rx + blob.cx - blob.cx) / blob.rx,
    y: (dir.y * blob.ry + blob.cy - blob.cy) / blob.ry,
    z: (dir.z * blob.rz + blob.cz - blob.cz) / blob.rz,
  };
  const n = norm(q);
  return { x: blob.cx + n.x * blob.rx, y: blob.cy + n.y * blob.ry, z: blob.cz + n.z * blob.rz };
}

function sculpt(dir: Vec, spec: Spec): Vec {
  let best: Vec | null = null;
  let bestR = -1;
  for (const blob of spec.blobs) {
    const p = onBlob(dir, blob);
    const r = len(p);
    if (r > bestR) {
      best = p;
      bestR = r;
    }
  }
  const p = best!;
  const n = fbm(mul(dir, 2.4), spec.seed);
  return add(p, mul(dir, n * spec.warp * (bestR * 0.55 + 1.2)));
}

function build(spec: Spec): {
  pos: Float32Array;
  nor: Float32Array;
  rock: number[];
  lichen: number[];
  min: [number, number, number];
  max: [number, number, number];
} {
  const { verts: unit, faces } = icosphere(SUBDIV);
  const verts = unit.map((d) => sculpt(d, spec));
  let minY = Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const v of verts) {
    minY = Math.min(minY, v.y);
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minZ = Math.min(minZ, v.z);
    maxZ = Math.max(maxZ, v.z);
  }
  const span = Math.max(maxX - minX, maxZ - minZ) || 1;
  const s = SPAN / span;
  for (const v of verts) {
    v.x *= s;
    v.y = Math.max(0, (v.y - minY) * s);
    v.z *= s;
  }
  const acc = verts.map(() => ({ x: 0, y: 0, z: 0 }));
  for (const [a, b, c] of faces) {
    const pa = verts[a]!;
    const pb = verts[b]!;
    const pc = verts[c]!;
    const n = {
      x: (pb.y - pa.y) * (pc.z - pa.z) - (pb.z - pa.z) * (pc.y - pa.y),
      y: (pb.z - pa.z) * (pc.x - pa.x) - (pb.x - pa.x) * (pc.z - pa.z),
      z: (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x),
    };
    acc[a] = add(acc[a]!, n);
    acc[b] = add(acc[b]!, n);
    acc[c] = add(acc[c]!, n);
  }
  const nors = acc.map(norm);
  const rock: number[] = [];
  const lichen: number[] = [];
  for (const [a, b, c] of faces) {
    const ny = (nors[a]!.y + nors[b]!.y + nors[c]!.y) / 3;
    const mid = mul(add(add(verts[a]!, verts[b]!), verts[c]!), 1 / 3);
    const moss = ny > 0.42 && noise(mul(mid, 0.28), spec.seed + 99) > 0.12;
    const out = moss ? lichen : rock;
    out.push(a, b, c);
  }
  const pos = new Float32Array(verts.length * 3);
  const nor = new Float32Array(verts.length * 3);
  let loX = Infinity;
  let loY = Infinity;
  let loZ = Infinity;
  let hiX = -Infinity;
  let hiY = -Infinity;
  let hiZ = -Infinity;
  for (let i = 0; i < verts.length; i++) {
    const v = verts[i]!;
    const n = nors[i]!;
    pos[i * 3] = v.x;
    pos[i * 3 + 1] = v.y;
    pos[i * 3 + 2] = v.z;
    nor[i * 3] = n.x;
    nor[i * 3 + 1] = n.y;
    nor[i * 3 + 2] = n.z;
    loX = Math.min(loX, v.x);
    loY = Math.min(loY, v.y);
    loZ = Math.min(loZ, v.z);
    hiX = Math.max(hiX, v.x);
    hiY = Math.max(hiY, v.y);
    hiZ = Math.max(hiZ, v.z);
  }
  return { pos, nor, rock, lichen, min: [loX, loY, loZ], max: [hiX, hiY, hiZ] };
}

function mat(name: string, rgb: readonly [number, number, number], rough: number) {
  return { name, pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: 0, roughnessFactor: rough } };
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "../assets/props");
for (const spec of SPECS) {
  const mesh = build(spec);
  const posBytes = Buffer.from(mesh.pos.buffer, mesh.pos.byteOffset, mesh.pos.byteLength);
  const norBytes = Buffer.from(mesh.nor.buffer, mesh.nor.byteOffset, mesh.nor.byteLength);
  const rockIdx = new Uint16Array(mesh.rock);
  const lichenIdx = new Uint16Array(mesh.lichen);
  const rockBytes = Buffer.from(rockIdx.buffer, rockIdx.byteOffset, rockIdx.byteLength);
  const lichenBytes = Buffer.from(lichenIdx.buffer, lichenIdx.byteOffset, lichenIdx.byteLength);
  const bin = Buffer.concat([posBytes, norBytes, rockBytes, lichenBytes]);
  const norOff = posBytes.length;
  const rockOff = norOff + norBytes.length;
  const lichenOff = rockOff + rockBytes.length;
  const gltf = {
    asset: { version: "2.0", generator: "utc-rock" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: spec.file.replace(".gltf", ""), mesh: 0 }],
    meshes: [
      {
        name: spec.file.replace(".gltf", ""),
        primitives: [
          { attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 },
          { attributes: { POSITION: 0, NORMAL: 1 }, indices: 3, material: 1 },
        ],
      },
    ],
    materials: [mat("stone", spec.stone, 0.88), mat("lichen", spec.lichen, 0.76)],
    accessors: [
      { bufferView: 0, componentType: 5126, count: mesh.pos.length / 3, type: "VEC3", min: mesh.min, max: mesh.max },
      { bufferView: 1, componentType: 5126, count: mesh.nor.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: mesh.rock.length, type: "SCALAR" },
      { bufferView: 3, componentType: 5123, count: mesh.lichen.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: norOff, byteLength: norBytes.length, target: 34962 },
      { buffer: 0, byteOffset: rockOff, byteLength: rockBytes.length, target: 34963 },
      { buffer: 0, byteOffset: lichenOff, byteLength: lichenBytes.length, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length, uri: `data:application/octet-stream;base64,${bin.toString("base64")}` }],
  };
  const out = join(dir, spec.file);
  writeFileSync(out, JSON.stringify(gltf));
  const [loX, loY, loZ] = mesh.min;
  const [hiX, hiY, hiZ] = mesh.max;
  console.log(
    `wrote ${out}  xz=${(hiX - loX).toFixed(1)}×${(hiZ - loZ).toFixed(1)}  h=${(hiY - loY).toFixed(1)}  faces=${mesh.rock.length / 3 + mesh.lichen.length / 3}`,
  );
}
