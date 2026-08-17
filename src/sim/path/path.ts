/**
 * Walkability + BFS on the diamond grid. Phase 4 pathing — A* comes later.
 * Trees/stones block via `ObjectGrid`.
 */
import { HEX_DELTAS, isRiver, isWater, type GridPos } from "../../shared";
import type { MapGrid } from "../map/mapGrid";
import { isAdjacent } from "../object/object";

export type Blockers = { blocks(x: number, y: number): boolean };

export function isWalkable(grid: MapGrid, x: number, y: number, blockers?: Blockers): boolean {
  if (!grid.inBounds(x, y)) return false;
  const t = grid.landscapeAt(x, y);
  if (isWater(t) || isRiver(t)) return false;
  return !blockers?.blocks(x, y);
}

/** Path from `from` to `to`, excluding start. Empty if already there. Null if blocked. */
export function findPath(
  grid: MapGrid,
  from: GridPos,
  to: GridPos,
  blockers?: Blockers,
): GridPos[] | null {
  if (from.x === to.x && from.y === to.y) return [];
  if (!isWalkable(grid, to.x, to.y, blockers)) return null;

  const w = grid.width;
  const key = (x: number, y: number) => y * w + x;
  const came = new Int32Array(w * grid.height);
  came.fill(-1);
  const q: number[] = [key(from.x, from.y)];
  came[q[0]!] = q[0]!;

  const goal = key(to.x, to.y);
  let head = 0;
  while (head < q.length) {
    const cur = q[head++]!;
    if (cur === goal) break;
    const x = cur % w;
    const y = (cur / w) | 0;
    for (const { dx, dy } of HEX_DELTAS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkable(grid, nx, ny, blockers)) continue;
      const nk = key(nx, ny);
      if (came[nk] !== -1) continue;
      came[nk] = cur;
      q.push(nk);
    }
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
  const seen = new Uint8Array(w * grid.height);
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
