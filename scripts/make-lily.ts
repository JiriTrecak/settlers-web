/**
 * Writes three pond lilies to assets/props/lily*.gltf — pad + blossom, sit on the water plane.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PAD_SEGS = 14;
const PETALS = 6;

const TINTS = [
  { file: "lily.gltf", petal: [0.86, 0.36, 0.5], center: [0.92, 0.72, 0.18] },
  { file: "lily-white.gltf", petal: [0.93, 0.91, 0.86], center: [0.9, 0.7, 0.2] },
  { file: "lily-gold.gltf", petal: [0.9, 0.72, 0.2], center: [0.82, 0.42, 0.12] },
] as const;

const PAD: readonly [number, number, number] = [0.2, 0.46, 0.28];

type Vert = { x: number; y: number; z: number; nx: number; ny: number; nz: number };

const verts: Vert[] = [];
const pad: number[] = [];
const bloom: number[] = [];
const heart: number[] = [];

function add(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
  const len = Math.hypot(nx, ny, nz) || 1;
  verts.push({ x, y, z, nx: nx / len, ny: ny / len, nz: nz / len });
  return verts.length - 1;
}

function padRadius(i: number): number {
  const a = (i / PAD_SEGS) * Math.PI * 2;
  const notch = Math.exp(-((a / 0.38) ** 2)) * 0.28;
  return 0.46 * (1 - notch);
}

function padY(r: number): number {
  const t = r / 0.46;
  return 0.012 + 0.02 * t * t;
}

const rim: number[] = [];
for (let i = 0; i < PAD_SEGS; i++) {
  const a = (i / PAD_SEGS) * Math.PI * 2;
  const r = padRadius(i);
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  rim.push(add(x, padY(r), z, x * 0.15, 1, z * 0.15));
}
const hub = add(0, 0.01, 0, 0, 1, 0);
for (let i = 0; i < PAD_SEGS; i++) {
  const j = (i + 1) % PAD_SEGS;
  pad.push(hub, rim[i]!, rim[j]!);
}
const under: number[] = [];
for (let i = 0; i < PAD_SEGS; i++) {
  const a = (i / PAD_SEGS) * Math.PI * 2;
  const r = padRadius(i);
  under.push(add(Math.cos(a) * r, padY(r) - 0.008, Math.sin(a) * r, 0, -1, 0));
}
const underHub = add(0, 0.002, 0, 0, -1, 0);
for (let i = 0; i < PAD_SEGS; i++) {
  const j = (i + 1) % PAD_SEGS;
  pad.push(underHub, under[j]!, under[i]!);
}

for (let p = 0; p < PETALS; p++) {
  const yaw = (p / PETALS) * Math.PI * 2 + 0.12;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const y0 = 0.04;
  const tip = add(c * 0.2, y0 + 0.07, s * 0.2, c * 0.35, 0.9, s * 0.35);
  const left = add(c * 0.08 - s * 0.055, y0 + 0.03, s * 0.08 + c * 0.055, -s, 0.7, c);
  const right = add(c * 0.08 + s * 0.055, y0 + 0.03, s * 0.08 - c * 0.055, s, 0.7, -c);
  const base = add(c * 0.02, y0 + 0.018, s * 0.02, 0, 1, 0);
  bloom.push(base, left, tip, base, tip, right);
}

const bud = add(0, 0.055, 0, 0, 1, 0);
const budRim: number[] = [];
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2;
  budRim.push(add(Math.cos(a) * 0.028, 0.038, Math.sin(a) * 0.028, Math.cos(a), 0.4, Math.sin(a)));
}
for (let i = 0; i < 6; i++) heart.push(budRim[i]!, bud, budRim[(i + 1) % 6]!);

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

const padIdx = new Uint16Array(pad);
const bloomIdx = new Uint16Array(bloom);
const heartIdx = new Uint16Array(heart);
const posBytes = Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength);
const norBytes = Buffer.from(nor.buffer, nor.byteOffset, nor.byteLength);
const padBytes = Buffer.from(padIdx.buffer, padIdx.byteOffset, padIdx.byteLength);
const bloomBytes = Buffer.from(bloomIdx.buffer, bloomIdx.byteOffset, bloomIdx.byteLength);
const heartBytes = Buffer.from(heartIdx.buffer, heartIdx.byteOffset, heartIdx.byteLength);
const bin = Buffer.concat([posBytes, norBytes, padBytes, bloomBytes, heartBytes]);

function mat(name: string, rgb: readonly [number, number, number], rough: number) {
  return { name, pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: 0, roughnessFactor: rough } };
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "../assets/props");
for (const tint of TINTS) {
  const gltf = {
    asset: { version: "2.0", generator: "utc-lily" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "lily", mesh: 0 }],
    meshes: [
      {
        name: "lily",
        primitives: [
          { attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 },
          { attributes: { POSITION: 0, NORMAL: 1 }, indices: 3, material: 1 },
          { attributes: { POSITION: 0, NORMAL: 1 }, indices: 4, material: 2 },
        ],
      },
    ],
    materials: [mat("pad", PAD, 0.82), mat("petal", tint.petal, 0.55), mat("center", tint.center, 0.48)],
    accessors: [
      { bufferView: 0, componentType: 5126, count: verts.length, type: "VEC3", min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
      { bufferView: 1, componentType: 5126, count: verts.length, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: pad.length, type: "SCALAR" },
      { bufferView: 3, componentType: 5123, count: bloom.length, type: "SCALAR" },
      { bufferView: 4, componentType: 5123, count: heart.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: posBytes.length, byteLength: norBytes.length, target: 34962 },
      { buffer: 0, byteOffset: posBytes.length + norBytes.length, byteLength: padBytes.length, target: 34963 },
      { buffer: 0, byteOffset: posBytes.length + norBytes.length + padBytes.length, byteLength: bloomBytes.length, target: 34963 },
      {
        buffer: 0,
        byteOffset: posBytes.length + norBytes.length + padBytes.length + bloomBytes.length,
        byteLength: heartBytes.length,
        target: 34963,
      },
    ],
    buffers: [{ byteLength: bin.length, uri: `data:application/octet-stream;base64,${bin.toString("base64")}` }],
  };
  const out = join(dir, tint.file);
  writeFileSync(out, JSON.stringify(gltf));
  console.log(`wrote ${out} (${verts.length} verts, h=${maxY.toFixed(2)})`);
}
