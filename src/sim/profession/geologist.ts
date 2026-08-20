/**
 * Geologist brain. Job `geologist` is the RMB target. Walk there first, then
 * probe: hex ring 2 around the last tile (closest to the click), else a
 * walk-search of radius 30. The kneel + sign is `tickJob`. Failed BFS idles.
 */
import { HEX_DELTAS, hexDist, type GridPos } from "../../shared";
import { isSignable } from "../object/sign";
import { isPathable } from "../path/path";
import type { Movable } from "../movable/movable";
import type { ProfessionContext } from "./profession";

const SEARCH_RING = 2;
const SEARCH_FAR = 30;

export function tickGeologist(m: Movable, ctx: ProfessionContext): void {
  const job = m.job;
  if (!job || job.type !== "geologist") return;
  if (m.walking) return;
  if (!job.arrived) {
    if (m.pos.x === job.at.x && m.pos.y === job.at.y) job.arrived = true;
    else {
      tryPath(m, ctx, job.at);
      return;
    }
  }
  if (job.work) {
    if (m.pos.x === job.work.x && m.pos.y === job.work.y) return;
    tryPath(m, ctx, job.work);
    return;
  }
  const next = findSignable(ctx, job.current, job.at);
  if (!next) {
    m.idle();
    return;
  }
  job.work = next;
  job.current = next;
  m.claimTile(next);
  tryPath(m, ctx, next);
}

function tryPath(m: Movable, ctx: ProfessionContext, to: GridPos): void {
  if (!m.ensurePath(ctx.grid, to, ctx.blockers)) m.idle();
}

function findSignable(ctx: ProfessionContext, from: GridPos, center: GridPos): GridPos | null {
  const ring = bestOnRing(ctx, from, SEARCH_RING, center);
  if (ring) return ring;
  return searchWalk(ctx, from, SEARCH_FAR);
}

function signable(ctx: ProfessionContext, x: number, y: number): boolean {
  return isSignable(ctx.grid, ctx.buildings, ctx.objects, ctx.marks, x, y, ctx.blockers);
}

/** Hex border `radius` around `from`, closest to `center`. */
function bestOnRing(ctx: ProfessionContext, from: GridPos, radius: number, center: GridPos): GridPos | null {
  let best: GridPos | null = null;
  let bestD = Infinity;
  for (let y = from.y - radius; y <= from.y + radius; y++) {
    for (let x = from.x - radius; x <= from.x + radius; x++) {
      if (hexDist(from.x, from.y, x, y) !== radius) continue;
      if (!signable(ctx, x, y)) continue;
      const d = hexDist(center.x, center.y, x, y);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  return best;
}

/** Closest pathable signable within `radius` hexes, skipping `from`. */
function searchWalk(ctx: ProfessionContext, from: GridPos, radius: number): GridPos | null {
  const w = ctx.grid.width;
  const key = (x: number, y: number) => y * w + x;
  const seen = new Set<number>();
  const q: GridPos[] = [from];
  seen.add(key(from.x, from.y));
  let head = 0;
  while (head < q.length) {
    const cur = q[head++]!;
    for (const { dx, dy } of HEX_DELTAS) {
      const x = cur.x + dx;
      const y = cur.y + dy;
      const k = key(x, y);
      if (seen.has(k)) continue;
      if (hexDist(from.x, from.y, x, y) > radius) continue;
      if (!isPathable(ctx.grid, x, y, ctx.blockers)) continue;
      seen.add(k);
      if (signable(ctx, x, y)) return { x, y };
      q.push({ x, y });
    }
  }
  return null;
}
