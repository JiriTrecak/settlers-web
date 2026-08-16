import { HEX_DELTAS, isRiver, isWater, landscapeInfo, type LandscapeType } from "../../shared";
import { seedRng, type Rng } from "../rng/rng";
import { MapGrid } from "./mapGrid";

export type MapId = "coast" | "isles" | "peak";

export type MapDef = {
  id: MapId;
  name: string;
  seed: number;
  size: number;
};

export const MAPS: readonly MapDef[] = [
  { id: "coast", name: "Roman Coast", seed: 1998, size: 96 },
  { id: "isles", name: "Twin Isles", seed: 7, size: 96 },
  { id: "peak", name: "Snow Peak", seed: 333, size: 96 },
];

/** Elevation staircase. Adjacent verts may only differ by one step so border blends can fire. */
const ELEV_CHAIN = [
  "water8",
  "water7",
  "water6",
  "water5",
  "water4",
  "water3",
  "water2",
  "water1",
  "sand",
  "grass",
  "mountainBorderOuter",
  "mountainBorder",
  "mountain",
  "snowBorderOuter",
  "snowBorder",
  "snow",
] as const satisfies readonly LandscapeType[];

export function mapById(id: string): MapDef {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}

export function generateMap(def: MapDef, rng: Rng = seedRng(def.seed)): MapGrid {
  const { size } = def;
  const grid = new MapGrid(size, size);
  const seed = (rng.nextFloat() * 0xffffffff) >>> 0;
  const idx = new Int8Array(size * size);
  const elevs = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const island = mask(def.id, x, y, size);
      const n1 = fbm(x / 28, y / 28, seed, 5);
      const n2 = fbm(x / 14 + 40, y / 14, seed + 7, 4);
      const boost = def.id === "peak" ? 1.15 : 1;
      const elev = island * (0.35 + 0.75 * n1 + 0.2 * n2) * boost;
      elevs[y * size + x] = elev;
      idx[y * size + x] = elevToLandChain(elev, def.id);
    }
  }

  forceOceanBorder(idx, size);
  clampLand(idx, size);
  applyLand(grid, idx, elevs, def.id);
  fillWaterByDistance(grid);

  if (def.id === "coast") {
    paintDesert(grid, seed, 0.52, 0.58);
    paintMoor(grid, seed);
  } else if (def.id === "isles") {
    paintDesert(grid, seed, 0.55, 0.5);
  }

  carveRiver(grid);
  if (def.id === "isles") carveRiver(grid);
  stampPlateau(grid, def.id === "isles" ? 0.32 : def.id === "peak" ? 0.48 : 0.42, def.id === "isles" ? 0.4 : def.id === "peak" ? 0.62 : 0.48);
  if (def.id !== "peak") paintDryGrass(grid, seed);
  flattenFlats(grid);
  smoothHeights(grid);
  return grid;
}

/** @deprecated use generateMap */
export function generateIsland(width: number, _height: number, rng: Rng): MapGrid {
  return generateMap({ id: "coast", name: "Roman Coast", seed: 0, size: width }, rng);
}

/** -1 = water (filled later). 8+ = sand…snow. */
function elevToLandChain(e: number, id: MapId): number {
  if (e < 0.26) return -1;
  if (e < 0.32) return 8;
  if (id === "peak") {
    if (e < 0.52) return 9;
    if (e < 0.6) return 10;
    if (e < 0.68) return 11;
    if (e < 0.8) return 12;
    if (e < 0.86) return 13;
    if (e < 0.92) return 14;
    return 15;
  }
  if (e < 0.7) return 9;
  if (e < 0.78) return 10;
  if (e < 0.86) return 11;
  if (e < 0.93) return 12;
  if (e < 0.97) return 13;
  return 14;
}

function forceOceanBorder(idx: Int8Array, size: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x <= 1 || y <= 1 || x >= size - 2 || y >= size - 2) idx[y * size + x] = -1;
    }
  }
}

function stepOf(idx: Int8Array, i: number): number {
  return idx[i]! < 0 ? 7 : idx[i]!;
}

function clampLand(idx: Int8Array, size: number): void {
  let changed = true;
  let guard = size * 4;
  while (changed && guard-- > 0) {
    changed = false;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const ai = stepOf(idx, i);
        for (const { dx, dy } of HEX_DELTAS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const ni = ny * size + nx;
          if (idx[ni]! < 8) continue;
          const an = idx[ni]!;
          if (an > ai + 1) {
            idx[ni] = ai + 1;
            changed = true;
          } else if (an < ai - 1) {
            idx[ni] = ai - 1;
            changed = true;
          }
        }
      }
    }
  }
}

function applyLand(grid: MapGrid, idx: Int8Array, elevs: Float32Array, id: MapId): void {
  const { width, height } = grid;
  const scale = id === "peak" ? 42 : 34;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const step = idx[i]!;
      if (step < 8) {
        grid.setLandscape(x, y, "water8");
        grid.setHeight(x, y, 0);
        continue;
      }
      const type = ELEV_CHAIN[step] ?? "grass";
      grid.setLandscape(x, y, type);
      if (type === "sand") grid.setHeight(x, y, 1);
      else grid.setHeight(x, y, Math.max(2, Math.round((elevs[i]! - 0.26) * scale)));
    }
  }
}

function fillWaterByDistance(grid: MapGrid): void {
  const { width, height } = grid;
  const dist = new Int16Array(width * height);
  dist.fill(32767);
  const q: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isWater(grid.landscapeAt(x, y))) continue;
      const i = y * width + x;
      dist[i] = 0;
      q.push(i);
    }
  }
  for (let head = 0; head < q.length; head++) {
    const i = q[head]!;
    const x = i % width;
    const y = (i / width) | 0;
    for (const { dx, dy } of HEX_DELTAS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      const nd = dist[i]! + 1;
      if (nd >= dist[ni]!) continue;
      dist[ni] = nd;
      q.push(ni);
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isWater(grid.landscapeAt(x, y))) continue;
      const d = Math.max(1, Math.min(8, dist[y * width + x]!));
      grid.setLandscape(x, y, ELEV_CHAIN[8 - d] ?? "water8");
    }
  }
}

function mask(id: MapId, x: number, y: number, size: number): number {
  const falloff = (cx: number, cy: number, radius: number): number => {
    const nx = (x - cx) / radius;
    const ny = (y - cy) / radius;
    const dist = Math.sqrt(nx * nx + ny * ny);
    return dist > 1.15 ? 0 : Math.max(0, 1 - dist * dist);
  };

  if (id === "isles") {
    return Math.max(
      falloff(size * 0.34, size * 0.4, size * 0.28),
      falloff(size * 0.68, size * 0.6, size * 0.26),
    );
  }
  if (id === "peak") {
    return falloff(size * 0.5, size * 0.52, size * 0.38);
  }
  return falloff((size - 1) / 2, (size - 1) / 2, size * 0.42);
}

function hash2(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 19);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function paintDesert(grid: MapGrid, seed: number, minXFrac: number, threshold: number): void {
  const { width, height } = grid;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid.landscapeAt(x, y) !== "grass") continue;
      if (x < width * minXFrac) continue;
      const n = fbm(x / 18 + 90, y / 18, seed + 91, 3);
      if (n > threshold) {
        grid.setLandscape(x, y, "desert");
        grid.setHeight(x, y, Math.max(1, grid.heightAt(x, y) - 2));
      }
    }
  }
  ringBorders(grid, "desert", "desertBorder", "desertBorderOuter");
}

function paintMoor(grid: MapGrid, seed: number): void {
  const { width, height } = grid;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid.landscapeAt(x, y) !== "grass") continue;
      if (x > width * 0.4 || y < height * 0.45) continue;
      const n = fbm(x / 16 + 12, y / 16, seed + 33, 3);
      if (n > 0.62) {
        grid.setLandscape(x, y, "moor");
        grid.setHeight(x, y, 0);
      }
    }
  }
  ringBorders(grid, "moor", "moorBorder", "moorBorderOuter");
}

function paintDryGrass(grid: MapGrid, seed: number): void {
  const { width, height } = grid;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid.landscapeAt(x, y) !== "grass") continue;
      if (!allNeighbors(grid, x, y, (t) => t === "grass" || t === "dryGrass")) continue;
      if (fbm(x / 14 + 4, y / 14, seed + 11, 3) > 0.58) {
        grid.setLandscape(x, y, "dryGrass");
      }
    }
  }
}

function allNeighbors(grid: MapGrid, x: number, y: number, pred: (t: LandscapeType) => boolean): boolean {
  for (const { dx, dy } of HEX_DELTAS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    if (!pred(grid.landscapeAt(nx, ny))) return false;
  }
  return true;
}

function ringBorders(
  grid: MapGrid,
  inner: LandscapeType,
  border: LandscapeType,
  outer: LandscapeType,
): void {
  const { width, height } = grid;
  const snap: LandscapeType[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) snap.push(grid.landscapeAt(x, y));
  }
  const at = (x: number, y: number) => snap[y * width + x]!;
  const near = (x: number, y: number, pred: (t: LandscapeType) => boolean): boolean => {
    for (const { dx, dy } of HEX_DELTAS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      if (pred(at(nx, ny))) return true;
    }
    return false;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = at(x, y);
      if (t === inner && near(x, y, (n) => n !== inner && n !== border)) {
        grid.setLandscape(x, y, border);
      } else if (t === "grass" && near(x, y, (n) => n === inner || n === border)) {
        grid.setLandscape(x, y, outer);
      }
    }
  }
}

function carveRiver(grid: MapGrid): void {
  const riverOk = (t: LandscapeType) => t === "grass" || t === "sand" || isWater(t);
  const painted = new Set<number>();
  const canPlace = (x: number, y: number): boolean => {
    const t = grid.landscapeAt(x, y);
    if (t !== "grass" && t !== "sand") return false;
    for (const { dx, dy } of HEX_DELTAS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const nt = grid.landscapeAt(nx, ny);
      if (!riverOk(nt) && !isRiver(nt) && !painted.has(ny * grid.width + nx)) return false;
    }
    return true;
  };

  const starts: { x: number; y: number; h: number }[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (!canPlace(x, y)) continue;
      starts.push({ x, y, h: grid.heightAt(x, y) });
    }
  }
  starts.sort((a, b) => b.h - a.h);

  const minLen = Math.max(10, (grid.width / 8) | 0);
  for (const start of starts.slice(0, 24)) {
    const path: { x: number; y: number }[] = [];
    let x = start.x;
    let y = start.y;
    let guard = grid.width * grid.height;
    const local = new Set<number>();
    let reachedWater = false;
    while (guard-- > 0) {
      const type = grid.landscapeAt(x, y);
      if (isWater(type)) {
        reachedWater = true;
        break;
      }
      if (!canPlace(x, y)) break;
      path.push({ x, y });
      local.add(y * grid.width + x);
      let next = { x, y, h: 999, found: false };
      for (const { dx, dy } of HEX_DELTAS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!grid.inBounds(nx, ny)) continue;
        const ni = ny * grid.width + nx;
        if (painted.has(ni) || local.has(ni)) continue;
        const nt = grid.landscapeAt(nx, ny);
        if (isWater(nt)) {
          next = { x: nx, y: ny, h: -999, found: true };
          break;
        }
        if (!canPlace(nx, ny)) continue;
        let rivers = 0;
        for (const { dx: dx2, dy: dy2 } of HEX_DELTAS) {
          const ax = nx + dx2;
          const ay = ny + dy2;
          if (!grid.inBounds(ax, ay)) continue;
          const ai = ay * grid.width + ax;
          if (isRiver(grid.landscapeAt(ax, ay)) || painted.has(ai) || local.has(ai)) rivers++;
        }
        if (rivers >= 2) continue;
        const h = grid.heightAt(nx, ny);
        if (h < next.h) next = { x: nx, y: ny, h, found: true };
      }
      if (!next.found || (next.x === x && next.y === y)) break;
      x = next.x;
      y = next.y;
    }
    if (!reachedWater || path.length < minLen) continue;
    for (const p of path) {
      const r = (p.x + p.y) & 3;
      const variant: LandscapeType =
        r === 0 ? "river1" : r === 1 ? "river2" : r === 2 ? "river3" : "river4";
      grid.setLandscape(p.x, p.y, variant);
      grid.setHeight(p.x, p.y, Math.max(0, grid.heightAt(p.x, p.y) - 1));
      painted.add(p.y * grid.width + p.x);
    }
    return;
  }
}

function stampPlateau(grid: MapGrid, fx: number, fy: number): void {
  const gx = Math.floor(grid.width * fx);
  const gy = Math.floor(grid.height * fy);
  for (let y = gy - 3; y <= gy + 3; y++) {
    for (let x = gx - 3; x <= gx + 3; x++) {
      if (!grid.inBounds(x, y)) continue;
      if (grid.landscapeAt(x, y) !== "grass") continue;
      if (!allNeighbors(grid, x, y, (t) => t === "grass" || t === "flattened")) continue;
      const d = Math.abs(x - gx) + Math.abs(y - gy);
      if (d <= 3) {
        grid.setLandscape(x, y, "flattened");
        grid.setHeight(x, y, 8);
      }
    }
  }
}

function flattenFlats(grid: MapGrid): void {
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (landscapeInfo[grid.landscapeAt(x, y)].flat) {
        grid.setHeight(x, y, 0);
      }
    }
  }
}

function smoothHeights(grid: MapGrid): void {
  const maxDelta = 2;
  let changed = true;
  let guard = 64;
  while (changed && guard-- > 0) {
    changed = false;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (landscapeInfo[grid.landscapeAt(x, y)].flat) continue;
        const h = grid.heightAt(x, y);
        for (const { dx, dy } of HEX_DELTAS) {
          const nx = x + dx;
          const ny = y + dy;
          if (!grid.inBounds(nx, ny)) continue;
          if (landscapeInfo[grid.landscapeAt(nx, ny)].flat) continue;
          const nh = grid.heightAt(nx, ny);
          if (nh > h + maxDelta) {
            grid.setHeight(nx, ny, h + maxDelta);
            changed = true;
          } else if (nh < h - maxDelta) {
            grid.setHeight(nx, ny, h - maxDelta);
            changed = true;
          }
        }
      }
    }
  }
}
