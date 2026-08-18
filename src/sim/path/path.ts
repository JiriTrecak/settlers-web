/**
 * Walkability + BFS on the diamond grid.
 * Trees/stones/huts block via `blocks`. Other units are `occupied` — BFS walks
 * through them (prefer free hexes of equal length); the step still refuses a taken tile.
 */
import { HEX_DELTAS, isWater, type GridPos } from "../../shared";
import type { MapGrid } from "../map/mapGrid";
import { isAdjacent } from "../object/object";

export type Blockers = {
  blocks(x: number, y: number): boolean;
  occupied?(x: number, y: number): boolean;
};

/** Grown to max(w*h) seen this session; `.fill` each use. Safe: one BFS at a time. */
let cameBuf: Int32Array | null = null;
let seenBuf: Uint8Array | null = null;

function cameScratch(n: number): Int32Array {
  if (!cameBuf || cameBuf.length < n) cameBuf = new Int32Array(n);
  cameBuf.fill(-1, 0, n);
  return cameBuf;
}

function seenScratch(n: number): Uint8Array {
  if (!seenBuf || seenBuf.length < n) seenBuf = new Uint8Array(n);
  seenBuf.fill(0, 0, n);
  return seenBuf;
}

/** Landscape + `blocks` (no occupancy). */
export function isPathable(grid: MapGrid, x: number, y: number, blockers?: Blockers): boolean {
  if (!grid.inBounds(x, y)) return false;
  const t = grid.landscapeAt(x, y);
  if (isWater(t)) return false;
  return !blockers?.blocks(x, y);
}

/** Pathable and empty. Stepping / standing use this. */
export function isWalkable(grid: MapGrid, x: number, y: number, blockers?: Blockers): boolean {
  if (!isPathable(grid, x, y, blockers)) return false;
  return !blockers?.occupied?.(x, y);
}

/** Path from `from` to `to`, excluding start. Empty if already there. Null if blocked. */
export function findPath(
  grid: MapGrid,
  from: GridPos,
  to: GridPos,
  blockers?: Blockers,
): GridPos[] | null {
  if (from.x === to.x && from.y === to.y) return [];
  if (!isPathable(grid, to.x, to.y, blockers)) return null;
  if (isAdjacent(from, to)) return [to];

  const w = grid.width;
  const n = w * grid.height;
  const key = (x: number, y: number) => y * w + x;
  const came = cameScratch(n);
  const q: number[] = [key(from.x, from.y)];
  came[q[0]!] = q[0]!;

  const goal = key(to.x, to.y);
  let head = 0;
  while (head < q.length) {
    const cur = q[head++]!;
    if (cur === goal) break;
    const x = cur % w;
    const y = (cur / w) | 0;
    let busy: number[] | null = null;
    for (const { dx, dy } of HEX_DELTAS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isPathable(grid, nx, ny, blockers)) continue;
      const nk = key(nx, ny);
      if (came[nk] !== -1) continue;
      came[nk] = cur;
      if (blockers?.occupied?.(nx, ny)) {
        (busy ??= []).push(nk);
      } else {
        q.push(nk);
      }
    }
    if (busy) for (const nk of busy) q.push(nk);
  }
  if (came[goal] === -1) return null;

  const out: GridPos[] = [];
  let k = goal;
  const start = key(from.x, from.y);
  while (k !== start) {
    out.push({ x: k % w, y: (k / w) | 0 });
    k = came[k]!;
  }
  out.reverse();
  return out;
}

/** Nearest walkable tile, BFS from `seed`. */
export function nearestWalkable(grid: MapGrid, seed: GridPos, blockers?: Blockers): GridPos | null {
  if (isWalkable(grid, seed.x, seed.y, blockers)) return seed;
  const w = grid.width;
  const seen = seenScratch(w * grid.height);
  const q: GridPos[] = [seed];
  if (grid.inBounds(seed.x, seed.y)) seen[seed.y * w + seed.x] = 1;
  let head = 0;
  while (head < q.length) {
    const { x, y } = q[head++]!;
    for (const { dx, dy } of HEX_DELTAS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const i = ny * w + nx;
      if (seen[i]) continue;
      seen[i] = 1;
      if (isWalkable(grid, nx, ny, blockers)) return { x: nx, y: ny };
      q.push({ x: nx, y: ny });
    }
  }
  return null;
}

/** Walkable neighbor of `target` closest to `from`. `from` itself if already adjacent. */
export function standBeside(
  grid: MapGrid,
  target: GridPos,
  from: GridPos,
  blockers?: Blockers,
): GridPos | null {
  if (isAdjacent(from, target) && isWalkable(grid, from.x, from.y, blockers)) return from;
  let best: GridPos | null = null;
  let bestD = Infinity;
  for (const { dx, dy } of HEX_DELTAS) {
    const x = target.x + dx;
    const y = target.y + dy;
    if (!isWalkable(grid, x, y, blockers)) continue;
    const d = (x - from.x) * (x - from.x) + (y - from.y) * (y - from.y);
    if (d < bestD) {
      bestD = d;
      best = { x, y };
    }
  }
  return best;
}
