/**
 * Writes three low-poly wood/stone bridges (8 / 16 / 32 × 4) to assets/props/bridge-*.gltf.
 * Planks sit on y=0 (water / grass). Posts hang into the basin. Length along X.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WIDTH = 4;
const LENGTHS = [8, 16, 32] as const;

const WOOD: readonly [number, number, number] = [0.42, 0.26, 0.14];
const STONE: readonly [number, number, number] = [0.46, 0.42, 0.36];

type Vert = { x: number; y: number; z: number; nx: number; ny: number; nz: number };

function build(length: number): { verts: Vert[]; wood: number[]; stone: number[] } {
  const verts: Vert[] = [];
  const wood: number[] = [];
  const stone: number[] = [];
  const hx = length / 2;
  const hz = WIDTH / 2;

  function add(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
    const len = Math.hypot(nx, ny, nz) || 1;
    verts.push({ x, y, z, nx: nx / len, ny: ny / len, nz: nz / len });
    return verts.length - 1;
  }

  function quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    nx: number, ny: number, nz: number,
    out: number[],
  ): void {
    const a = add(ax, ay, az, nx, ny, nz);
    const b = add(bx, by, bz, nx, ny, nz);
    const c = add(cx, cy, cz, nx, ny, nz);
    const d = add(dx, dy, dz, nx, ny, nz);
    out.push(a, b, c, a, c, d);
  }

  function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, out: number[]): void {
    quad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, out);
    quad(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1, out);
    quad(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0, out);
    quad(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0, out);
    quad(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0, out);
    quad(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0, out);
  }

  // Top of plank = grass / water plane so the walkway continues the bank.
  const deckY0 = -0.04;
  const deckY1 = 0.07;
  const plankN = 5;
  const plankGap = 0.05;
  const inner = hz - 0.08;
  const plankW = (inner * 2 - plankGap * (plankN - 1)) / plankN;
  for (let i = 0; i < plankN; i++) {
    const z0 = -inner + i * (plankW + plankGap);
    box(-hx, deckY0, z0, hx, deckY1, z0 + plankW, wood);
  }

  const beamH = 0.14;
  const posts = Math.max(2, Math.round(length / 4));
  for (let i = 0; i < posts; i++) {
    const t = posts === 1 ? 0 : i / (posts - 1);
    const x = -hx + 0.55 + t * (length - 1.1);
    box(x - 0.5, deckY0 - beamH, -inner, x + 0.5, deckY0, inner, wood);
    for (const z of [-hz + 0.32, hz - 0.32]) {
      box(x - 0.14, -1.05, z - 0.14, x + 0.14, deckY0, z + 0.14, wood);
    }
  }

  const railH = 0.28;
  const railT = 0.08;
  for (const z of [-hz + 0.02, hz - 0.02 - railT]) {
    box(-hx, deckY1, z, hx, deckY1 + railH, z + railT, wood);
  }
  for (let i = 0; i < posts; i++) {
    const t = posts === 1 ? 0 : i / (posts - 1);
    const x = -hx + 0.55 + t * (length - 1.1);
    for (const z of [-hz + 0.01, hz - 0.15]) {
      box(x - 0.07, deckY1, z, x + 0.07, deckY1 + railH + 0.06, z + 0.12, wood);
    }
  }

  const foot = Math.min(0.7, length * 0.1);
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -hx : hx - foot;
    const x1 = side < 0 ? -hx + foot : hx;
    box(x0, -0.22, -hz - 0.08, x1, deckY0, hz + 0.08, stone);
  }

  return { verts, wood, stone };
}

function mat(name: string, rgb: readonly [number, number, number], rough: number) {
  return { name, pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: 0, roughnessFactor: rough } };
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "../assets/props");
for (const length of LENGTHS) {
  const mesh = build(length);
  const pos = new Float32Array(mesh.verts.length * 3);
  const nor = new Float32Array(mesh.verts.length * 3);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < mesh.verts.length; i++) {
    const v = mesh.verts[i]!;
    pos[i * 3] = v.x;
    pos[i * 3 + 1] = v.y;
    pos[i * 3 + 2] = v.z;
    nor[i * 3] = v.nx;
    nor[i * 3 + 1] = v.ny;
    nor[i * 3 + 2] = v.nz;
    minX = Math.min(minX, v.x);
    minY = Math.min(minY, v.y);
    minZ = Math.min(minZ, v.z);
    maxX = Math.max(maxX, v.x);
    maxY = Math.max(maxY, v.y);
    maxZ = Math.max(maxZ, v.z);
  }
  const woodIdx = new Uint16Array(mesh.wood);
  const stoneIdx = new Uint16Array(mesh.stone);
  const posBytes = Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength);
  const norBytes = Buffer.from(nor.buffer, nor.byteOffset, nor.byteLength);
  const woodBytes = Buffer.from(woodIdx.buffer, woodIdx.byteOffset, woodIdx.byteLength);
  const stoneBytes = Buffer.from(stoneIdx.buffer, stoneIdx.byteOffset, stoneIdx.byteLength);
  const bin = Buffer.concat([posBytes, norBytes, woodBytes, stoneBytes]);
  const name = `bridge-${length}`;
  const gltf = {
    asset: { version: "2.0", generator: "utc-bridge" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [
      {
        name,
        primitives: [
          { attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 },
          { attributes: { POSITION: 0, NORMAL: 1 }, indices: 3, material: 1 },
        ],
      },
    ],
    materials: [mat("wood", WOOD, 0.82), mat("stone", STONE, 0.9)],
    accessors: [
      { bufferView: 0, componentType: 5126, count: mesh.verts.length, type: "VEC3", min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
      { bufferView: 1, componentType: 5126, count: mesh.verts.length, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: mesh.wood.length, type: "SCALAR" },
      { bufferView: 3, componentType: 5123, count: mesh.stone.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: posBytes.length, byteLength: norBytes.length, target: 34962 },
      { buffer: 0, byteOffset: posBytes.length + norBytes.length, byteLength: woodBytes.length, target: 34963 },
      { buffer: 0, byteOffset: posBytes.length + norBytes.length + woodBytes.length, byteLength: stoneBytes.length, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length, uri: `data:application/octet-stream;base64,${bin.toString("base64")}` }],
  };
  const out = join(dir, `${name}.gltf`);
  writeFileSync(out, JSON.stringify(gltf));
  console.log(`wrote ${out}  ${length}×${WIDTH}  verts=${mesh.verts.length}`);
}
