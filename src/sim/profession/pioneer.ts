/**
 * Pioneer brain. Job `pioneer` is the RMB target. Walk there first, then claim
 * unenforced foreign tiles: hex ring 1–6 toward the target, else search 30.
 * The kneel + tile flip is `tickJob`.
 */
import { hexDist, type GridPos } from "../../shared";
import { isWalkable } from "../path/path";
import type { Movable } from "../movable/movable";
import type { ProfessionContext } from "./profession";

const SEARCH_NEAR = 6;
const SEARCH_FAR = 30;

export function tickPioneer(m: Movable, ctx: ProfessionContext): void {
  const job = m.job;
  if (!job || job.type !== "pioneer") return;
  if (m.walking) return;
  if (!job.arrived) {
    if (m.pos.x === job.at.x && m.pos.y === job.at.y) job.arrived = true;
    else {
      m.pathTo(ctx.grid, job.at, ctx.blockers);
      return;
    }
  }
  if (claimable(ctx, m, m.pos.x, m.pos.y)) return;
  const next = findClaim(ctx, m, job.at);
  if (!next) {
    m.idle();
    return;
  }
  m.pathTo(ctx.grid, next, ctx.blockers);
}

function claimable(ctx: ProfessionContext, m: Movable, x: number, y: number): boolean {
  if (!ctx.land.canClaim(x, y, m.player)) return false;
  if (ctx.buildings.blocks(x, y)) return false;
  return isWalkable(ctx.grid, x, y, ctx.blockers);
}

function findClaim(ctx: ProfessionContext, m: Movable, target: GridPos): GridPos | null {
  const near = bestInRadius(ctx, m, target, SEARCH_NEAR);
  if (near) return near;
  return bestInRadius(ctx, m, target, SEARCH_FAR);
}

function bestInRadius(ctx: ProfessionContext, m: Movable, target: GridPos, radius: number): GridPos | null {
  let best: GridPos | null = null;
  let bestD = Infinity;
  for (let y = m.pos.y - radius; y <= m.pos.y + radius; y++) {
    for (let x = m.pos.x - radius; x <= m.pos.x + radius; x++) {
      const ring = hexDist(m.pos.x, m.pos.y, x, y);
      if (ring < 1 || ring > radius) continue;
      if (!claimable(ctx, m, x, y)) continue;
      const d = hexDist(target.x, target.y, x, y);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  return best;
}
