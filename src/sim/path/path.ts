/**
 * Walkability + BFS on the diamond grid. Phase 4 pathing — A* comes later.
 */
import { HEX_DELTAS, isRiver, isWater, type GridPos } from "../../shared";
import type { MapGrid } from "../map/mapGrid";

export function isWalkable(grid: MapGrid, x: number, y: number): boolean {
  if (!grid.inBounds(x, y)) return false;
  const t = grid.landscapeAt(x, y);
  return !isWater(t) && !isRiver(t);
}

/** Path from `from` to `to`, excluding start. Empty if already there. Null if blocked. */
export function findPath(grid: MapGrid, from: GridPos, to: GridPos): GridPos[] | null {
  if (from.x === to.x && from.y === to.y) return [];
  if (!isWalkable(grid, to.x, to.y)) return null;

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
      if (!isWalkable(grid, nx, ny)) continue;
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
export function nearestWalkable(grid: MapGrid, seed: GridPos): GridPos | null {
  if (isWalkable(grid, seed.x, seed.y)) return seed;
  const w = grid.width;
  const seen = new Uint8Array(w * grid.height);
  const q: GridPos[] = [seed];
  seen[seed.y * w + seed.x] = 1;
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
      if (isWalkable(grid, nx, ny)) return { x: nx, y: ny };
      q.push({ x: nx, y: ny });
    }
  }
  return null;
}
