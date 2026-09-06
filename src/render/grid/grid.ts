/**
 * Dark plate + cell grid in the Scouring style: hairline gray, fat white eights, fat edges.
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
  type Scene,
} from "three";
import { MAP_FRINGE, MAP_HALO, MAP_TILE } from "../../shared";

const FINE = 0x8a8a8a;
const MAJOR = 0xffffff;
const PLAY = 0xff2a2a;
const VIS = 0x2a7dff;
const FINE_W = 0.03;
const MAJOR_W = 0.16;
const EDGE_W = 0.22;

export function addSunAndGrid(scene: Scene, size: number): Mesh {
  const visLo = -MAP_HALO;
  const visHi = size + MAP_HALO;
  const lo = visLo - MAP_FRINGE;
  const hi = visHi + MAP_FRINGE;
  const span = hi - lo;
  const mid = (lo + hi) / 2;

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
    new PlaneGeometry(span, span),
    new MeshStandardMaterial({ color: 0x353330, roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(mid, 0, mid);
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = buildGrid(size, lo, hi, visLo, visHi);
  scene.add(grid);
  return grid;
}

function buildGrid(size: number, lo: number, hi: number, visLo: number, visHi: number): Mesh {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = lo; i <= hi; i++) {
    const major = i % MAP_TILE === 0;
    const w = major ? MAJOR_W : FINE_W;
    const y = major ? 0.035 : 0.02;
    const c = major ? MAJOR : FINE;
    ribbon(pos, col, idx, i, lo, i, hi, w, y, c);
    ribbon(pos, col, idx, lo, i, hi, i, w, y, c);
  }
  ring(pos, col, idx, 0, size, EDGE_W, 0.05, PLAY);
  ring(pos, col, idx, visLo, visHi, EDGE_W, 0.055, VIS);
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return new Mesh(
    geo,
    new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, depthWrite: false }),
  );
}

function ring(pos: number[], col: number[], idx: number[], a: number, b: number, w: number, y: number, color: number): void {
  ribbon(pos, col, idx, a, a, b, a, w, y, color);
  ribbon(pos, col, idx, a, b, b, b, w, y, color);
  ribbon(pos, col, idx, a, a, a, b, w, y, color);
  ribbon(pos, col, idx, b, a, b, b, w, y, color);
}

/** Flat XZ quad along a segment so width actually shows (WebGL lines stay 1px). */
function ribbon(
  pos: number[],
  col: number[],
  idx: number[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  w: number,
  y: number,
  color: number,
): void {
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const hw = w / 2;
  const b = pos.length / 3;
  if (alongX) {
    vert(pos, col, x0, y, z0 - hw, color);
    vert(pos, col, x1, y, z0 - hw, color);
    vert(pos, col, x1, y, z0 + hw, color);
    vert(pos, col, x0, y, z0 + hw, color);
  } else {
    vert(pos, col, x0 - hw, y, z0, color);
    vert(pos, col, x0 + hw, y, z0, color);
    vert(pos, col, x0 + hw, y, z1, color);
    vert(pos, col, x0 - hw, y, z1, color);
  }
  idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
}

function vert(pos: number[], col: number[], x: number, y: number, z: number, color: number): void {
  pos.push(x, y, z);
  col.push(((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255);
}
