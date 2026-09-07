/**
 * Grid lines to the blue halo. Fringe past that is void + grid (orientation only).
 * Dirt plate is HeightMesh. Lights live on `Sky`. Tiles = 16-cell lines. Full =
 * every cell + white eights. Ribbons drape when `heightAt` is passed.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  type Scene,
} from "three";
import { MAP_BLOCK, MAP_FRINGE, MAP_HALO, MAP_TILE, type GridMode } from "../../shared";

const FINE = 0x8a8a8a;
const MAJOR = 0xffffff;
const PLAY = 0xff2a2a;
const VIS = 0x2a7dff;
const FINE_W = 0.03;
const BLOCK_W = 0.07;
const MAJOR_W = 0.16;
const EDGE_W = 0.22;

export function addSunAndGrid(_scene: Scene, size: number, lines: Object3D = _scene, mode: GridMode = "tiles"): void {
  putGrid(lines, size, mode);
}

/** Rebuild the line mesh only — lights stay. */
export function putGrid(
  lines: Object3D,
  size: number,
  mode: GridMode,
  heightAt?: (x: number, z: number) => number,
): void {
  const visLo = -MAP_HALO;
  const visHi = size + MAP_HALO;
  const lo = visLo - MAP_FRINGE;
  const hi = visHi + MAP_FRINGE;
  while (lines.children.length) lines.remove(lines.children[0]!);
  if (mode === "none") return;
  const { solid, fine } = buildGrid(size, lo, hi, visLo, visHi, mode, heightAt);
  lines.add(solid);
  if (fine) lines.add(fine);
}

function buildGrid(
  size: number,
  lo: number,
  hi: number,
  visLo: number,
  visHi: number,
  mode: GridMode,
  heightAt?: (x: number, z: number) => number,
): { solid: Mesh; fine: Mesh | null } {
  const solid = buffers();
  const hair = buffers();
  const tiles = mode === "tiles";
  const lift = heightAt ?? (() => 0);
  for (let i = lo; i <= hi; i++) {
    const block = i % MAP_BLOCK === 0;
    if (tiles && !block) continue;
    if (block) {
      run(solid, i, lo, i, hi, BLOCK_W, 0.035, MAJOR, lift);
      run(solid, lo, i, hi, i, BLOCK_W, 0.035, MAJOR, lift);
    } else if (i % MAP_TILE === 0) {
      run(solid, i, lo, i, hi, MAJOR_W, 0.035, MAJOR, lift);
      run(solid, lo, i, hi, i, MAJOR_W, 0.035, MAJOR, lift);
    } else {
      run(hair, i, lo, i, hi, FINE_W, 0.02, FINE, lift);
      run(hair, lo, i, hi, i, FINE_W, 0.02, FINE, lift);
    }
  }
  ring(solid, 0, size, EDGE_W, 0.05, PLAY, lift);
  ring(solid, visLo, visHi, EDGE_W, 0.055, VIS, lift);
  return { solid: mesh(solid, 1), fine: hair.idx.length ? mesh(hair, 0.5) : null };
}

type Buf = { pos: number[]; col: number[]; idx: number[] };

function buffers(): Buf {
  return { pos: [], col: [], idx: [] };
}

function mesh(buf: Buf, opacity: number): Mesh {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(buf.pos), 3));
  geo.setAttribute("color", new BufferAttribute(new Float32Array(buf.col), 3));
  geo.setIndex(buf.idx);
  geo.computeBoundingSphere();
  return new Mesh(
    geo,
    new MeshBasicMaterial({
      vertexColors: true,
      side: DoubleSide,
      depthWrite: false,
      transparent: opacity < 1,
      opacity,
    }),
  );
}

function ring(
  buf: Buf,
  a: number,
  b: number,
  w: number,
  pad: number,
  color: number,
  lift: (x: number, z: number) => number,
): void {
  run(buf, a, a, b, a, w, pad, color, lift);
  run(buf, a, b, b, b, w, pad, color, lift);
  run(buf, a, a, a, b, w, pad, color, lift);
  run(buf, b, a, b, b, w, pad, color, lift);
}

/** Split a grid line into unit segments so it drapes the height mesh. */
function run(
  buf: Buf,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  w: number,
  pad: number,
  color: number,
  lift: (x: number, z: number) => number,
): void {
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  if (alongX) {
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    const z = z0;
    for (let x = lo; x < hi; x++) ribbon(buf, x, z, x + 1, z, w, pad, color, lift);
  } else {
    const lo = Math.min(z0, z1);
    const hi = Math.max(z0, z1);
    const x = x0;
    for (let z = lo; z < hi; z++) ribbon(buf, x, z, x, z + 1, w, pad, color, lift);
  }
}

/** Flat XZ quad along a segment so width actually shows (WebGL lines stay 1px). */
function ribbon(
  buf: Buf,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  w: number,
  pad: number,
  color: number,
  lift: (x: number, z: number) => number,
): void {
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const hw = w / 2;
  const y0 = lift(x0, z0) + pad;
  const y1 = lift(x1, z1) + pad;
  const b = buf.pos.length / 3;
  if (alongX) {
    vert(buf, x0, y0, z0 - hw, color);
    vert(buf, x1, y1, z0 - hw, color);
    vert(buf, x1, y1, z0 + hw, color);
    vert(buf, x0, y0, z0 + hw, color);
  } else {
    vert(buf, x0 - hw, y0, z0, color);
    vert(buf, x0 + hw, y0, z0, color);
    vert(buf, x0 + hw, y1, z1, color);
    vert(buf, x0 - hw, y1, z1, color);
  }
  buf.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
}

function vert(buf: Buf, x: number, y: number, z: number, color: number): void {
  buf.pos.push(x, y, z);
  buf.col.push(((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255);
}
