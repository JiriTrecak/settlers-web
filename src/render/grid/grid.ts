/**
 * Dark plate to the blue halo. Fringe past that is void + grid (orientation only).
 * Tiles = 16-cell lines. Full = every cell + white eights.
 */
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
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

export function addSunAndGrid(scene: Scene, size: number, lines: Object3D = scene, mode: GridMode = "tiles"): void {
  const visLo = -MAP_HALO;
  const visHi = size + MAP_HALO;
  const lo = visLo - MAP_FRINGE;
  const hi = visHi + MAP_FRINGE;
  const visSpan = visHi - visLo;
  const visMid = (visLo + visHi) / 2;
  const span = hi - lo;

  scene.background = new Color(0x2a2a2a);
  scene.add(new AmbientLight(0x8aa0b8, 0.45));

  const sun = new DirectionalLight(0xfff2d6, 2.2);
  sun.position.set(size * 0.35, size * 0.55, size * 0.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const extent = span * 0.6;
  sun.shadow.camera.left = -extent;
  sun.shadow.camera.right = extent;
  sun.shadow.camera.top = extent;
  sun.shadow.camera.bottom = -extent;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = size * 2;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.set(size / 2, 0, size / 2);

  const ground = new Mesh(
    new PlaneGeometry(visSpan, visSpan),
    new MeshStandardMaterial({ color: 0x353330, roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(visMid, 0, visMid);
  ground.receiveShadow = true;
  scene.add(ground);
  putGrid(lines, size, mode);
}

/** Rebuild the line mesh only — lights and plate stay. */
export function putGrid(lines: Object3D, size: number, mode: GridMode): void {
  const visLo = -MAP_HALO;
  const visHi = size + MAP_HALO;
  const lo = visLo - MAP_FRINGE;
  const hi = visHi + MAP_FRINGE;
  while (lines.children.length) lines.remove(lines.children[0]!);
  const { solid, fine } = buildGrid(size, lo, hi, visLo, visHi, mode);
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
): { solid: Mesh; fine: Mesh | null } {
  const solid = buffers();
  const hair = buffers();
  const tiles = mode === "tiles";
  for (let i = lo; i <= hi; i++) {
    const block = i % MAP_BLOCK === 0;
    if (tiles && !block) continue;
    if (block) {
      ribbon(solid, i, lo, i, hi, BLOCK_W, 0.035, MAJOR);
      ribbon(solid, lo, i, hi, i, BLOCK_W, 0.035, MAJOR);
    } else if (i % MAP_TILE === 0) {
      ribbon(solid, i, lo, i, hi, MAJOR_W, 0.035, MAJOR);
      ribbon(solid, lo, i, hi, i, MAJOR_W, 0.035, MAJOR);
    } else {
      ribbon(hair, i, lo, i, hi, FINE_W, 0.02, FINE);
      ribbon(hair, lo, i, hi, i, FINE_W, 0.02, FINE);
    }
  }
  ring(solid, 0, size, EDGE_W, 0.05, PLAY);
  ring(solid, visLo, visHi, EDGE_W, 0.055, VIS);
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

function ring(buf: Buf, a: number, b: number, w: number, y: number, color: number): void {
  ribbon(buf, a, a, b, a, w, y, color);
  ribbon(buf, a, b, b, b, w, y, color);
  ribbon(buf, a, a, a, b, w, y, color);
  ribbon(buf, b, a, b, b, w, y, color);
}

/** Flat XZ quad along a segment so width actually shows (WebGL lines stay 1px). */
function ribbon(buf: Buf, x0: number, z0: number, x1: number, z1: number, w: number, y: number, color: number): void {
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const hw = w / 2;
  const b = buf.pos.length / 3;
  if (alongX) {
    vert(buf, x0, y, z0 - hw, color);
    vert(buf, x1, y, z0 - hw, color);
    vert(buf, x1, y, z0 + hw, color);
    vert(buf, x0, y, z0 + hw, color);
  } else {
    vert(buf, x0 - hw, y, z0, color);
    vert(buf, x0 + hw, y, z0, color);
    vert(buf, x0 + hw, y, z1, color);
    vert(buf, x0 - hw, y, z1, color);
  }
  buf.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
}

function vert(buf: Buf, x: number, y: number, z: number, color: number): void {
  buf.pos.push(x, y, z);
  buf.col.push(((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255);
}
