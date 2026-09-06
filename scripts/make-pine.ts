/**
 * Writes three spruce tints to assets/props/pine*.gltf — same mesh, needle grade changes.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SEGS = 8;

const TINTS = [
  { file: "pine.gltf", bark: [0.34, 0.21, 0.12], needles: [0.14, 0.34, 0.18] },
  { file: "pine-dark.gltf", bark: [0.28, 0.16, 0.1], needles: [0.1, 0.22, 0.13] },
  { file: "pine-umber.gltf", bark: [0.24, 0.14, 0.09], needles: [0.16, 0.15, 0.09] },
] as const;

type Vert = { x: number; y: number; z: number; nx: number; ny: number; nz: number };

const verts: Vert[] = [];
const bark: number[] = [];
const needles: number[] = [];

function add(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
  const len = Math.hypot(nx, ny, nz) || 1;
  verts.push({ x, y, z, nx: nx / len, ny: ny / len, nz: nz / len });
  return verts.length - 1;
}

function ring(y: number, r: number, ny: number): number[] {
  const ids: number[] = [];
  for (let i = 0; i < SEGS; i++) {
    const a = (i / SEGS) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    ids.push(add(x, y, z, x, ny, z));
  }
  return ids;
}

function band(lo: number[], hi: number[], out: number[]): void {
  for (let i = 0; i < SEGS; i++) {
    const j = (i + 1) % SEGS;
    out.push(lo[i]!, hi[i]!, hi[j]!, lo[i]!, hi[j]!, lo[j]!);
  }
}

function cap(ids: number[], yN: number, out: number[]): void {
  const c = add(0, verts[ids[0]!]!.y, 0, 0, yN, 0);
  for (let i = 0; i < SEGS; i++) {
    const j = (i + 1) % SEGS;
    if (yN > 0) out.push(c, ids[i]!, ids[j]!);
    else out.push(c, ids[j]!, ids[i]!);
  }
}

function cone(y0: number, y1: number, r0: number, r1: number, out: number[]): void {
  const lo = ring(y0, r0, 0.15);
  const hi = ring(y1, r1, 0.55);
  band(lo, hi, out);
  if (r1 < 0.02) {
    const tip = add(0, y1, 0, 0, 1, 0);
    for (let i = 0; i < SEGS; i++) out.push(hi[i]!, tip, hi[(i + 1) % SEGS]!);
  } else cap(hi, 1, out);
}

const trunkLo = ring(0, 0.11, 0);
const trunkMid = ring(1.15, 0.08, 0);
const trunkHi = ring(2.05, 0.05, 0);
band(trunkLo, trunkMid, bark);
band(trunkMid, trunkHi, bark);
cap(trunkLo, -1, bark);

cone(0.45, 1.35, 1.15, 0.55, needles);
cone(1.05, 2.0, 0.92, 0.4, needles);
cone(1.65, 2.55, 0.7, 0.28, needles);
cone(2.15, 3.05, 0.48, 0.16, needles);
cone(2.6, 3.45, 0.28, 0.02, needles);

const pos = new Float32Array(verts.length * 3);
const nor = new Float32Array(verts.length * 3);
for (let i = 0; i < verts.length; i++) {
  const v = verts[i]!;
  pos[i * 3] = v.x;
  pos[i * 3 + 1] = v.y;
  pos[i * 3 + 2] = v.z;
  nor[i * 3] = v.nx;
  nor[i * 3 + 1] = v.ny;
  nor[i * 3 + 2] = v.nz;
}
const barkIdx = new Uint16Array(bark);
const needleIdx = new Uint16Array(needles);

let minX = Infinity;
let minY = Infinity;
let minZ = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
let maxZ = -Infinity;
for (const v of verts) {
  minX = Math.min(minX, v.x);
  minY = Math.min(minY, v.y);
  minZ = Math.min(minZ, v.z);
  maxX = Math.max(maxX, v.x);
  maxY = Math.max(maxY, v.y);
  maxZ = Math.max(maxZ, v.z);
}

const posBytes = Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength);
const norBytes = Buffer.from(nor.buffer, nor.byteOffset, nor.byteLength);
const barkBytes = Buffer.from(barkIdx.buffer, barkIdx.byteOffset, barkIdx.byteLength);
const needleBytes = Buffer.from(needleIdx.buffer, needleIdx.byteOffset, needleIdx.byteLength);
const bin = Buffer.concat([posBytes, norBytes, barkBytes, needleBytes]);

const posOff = 0;
const norOff = posBytes.length;
const barkOff = norOff + norBytes.length;
const needleOff = barkOff + barkBytes.length;

function mat(name: string, rgb: readonly [number, number, number], rough: number) {
  return { name, pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: 0, roughnessFactor: rough } };
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "../assets/props");
for (const tint of TINTS) {
  const gltf = {
    asset: { version: "2.0", generator: "utc-pine" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "pine", mesh: 0 }],
    meshes: [
      {
        name: "pine",
        primitives: [
          { attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 },
          { attributes: { POSITION: 0, NORMAL: 1 }, indices: 3, material: 1 },
        ],
      },
    ],
    materials: [mat("bark", tint.bark, 0.9), mat("needles", tint.needles, 0.74)],
    accessors: [
      { bufferView: 0, componentType: 5126, count: verts.length, type: "VEC3", min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
      { bufferView: 1, componentType: 5126, count: verts.length, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: bark.length, type: "SCALAR" },
      { bufferView: 3, componentType: 5123, count: needles.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: posOff, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: norOff, byteLength: norBytes.length, target: 34962 },
      { buffer: 0, byteOffset: barkOff, byteLength: barkBytes.length, target: 34963 },
      { buffer: 0, byteOffset: needleOff, byteLength: needleBytes.length, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length, uri: `data:application/octet-stream;base64,${bin.toString("base64")}` }],
  };
  const out = join(dir, tint.file);
  writeFileSync(out, JSON.stringify(gltf));
  console.log(`wrote ${out} (${verts.length} verts, h=${maxY.toFixed(2)})`);
}
