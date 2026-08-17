/**
 * Idle flock: jobless units step away from neighbors (and the map edge).
 * House spawn only clears the door; this is what actually spreads the crowd.
 */
import { approxDirection, deltaOf, DIRECTIONS, hexDist, neighborDir, type Direction } from "../../shared";
import type { BuildingGrid } from "../building/building";
import type { MapGrid } from "../map/mapGrid";
import type { ObjectGrid } from "../object/object";
import { isWalkable } from "../path/path";
import type { Rng } from "../rng/rng";
import type { Movable } from "./movable";

export type FlockContext = {
  grid: MapGrid;
  objects: ObjectGrid;
  buildings: BuildingGrid;
  units: readonly Movable[];
  rng: Rng;
  tickMs: number;
};

const FLOCK_RADIUS = 2;
const FLOCK_DELAY_MIN = 500;
const FLOCK_DELAY_MAX = 1000;

export function tickFlock(m: Movable, ctx: FlockContext): void {
  if (m.job || m.walking || m.inside) return;
  if (m.flockLeft > 0) {
    m.flockLeft -= 1;
    return;
  }

  const v = decentVector(m, ctx);
  const jitter = deltaOf(neighborDir(m.direction, ctx.rng.nextInt(5) - 2));
  const dx = jitter.dx + v.x;
  const dy = jitter.dy + v.y;
  if (hexDist(0, 0, dx, dy) >= 2) {
    m.flockDelayMs = Math.max(m.flockDelayMs - 100, FLOCK_DELAY_MIN);
    const dir = approxDirection(dx, dy);
    if (!stepIfFree(m, dir, ctx)) stepRandomFree(m, ctx);
    if (!m.walking) m.flockLeft = delayTicks(m, ctx.tickMs);
    return;
  }
  m.flockDelayMs = Math.min(m.flockDelayMs + 100, FLOCK_DELAY_MAX);
  m.flockLeft = delayTicks(m, ctx.tickMs);
}

function delayTicks(m: Movable, tickMs: number): number {
  return Math.max(1, Math.round(m.flockDelayMs / tickMs));
}

/** Repulsion from occupied tiles and OOB in hex rings 1..2. */
function decentVector(m: Movable, ctx: FlockContext): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let dy = -FLOCK_RADIUS; dy <= FLOCK_RADIUS; dy++) {
    for (let dx = -FLOCK_RADIUS; dx <= FLOCK_RADIUS; dx++) {
      const radius = hexDist(0, 0, dx, dy);
      if (radius < 1 || radius > FLOCK_RADIUS) continue;
      const cx = m.pos.x + dx;
      const cy = m.pos.y + dy;
      let factor: number;
      if (!ctx.grid.inBounds(cx, cy)) factor = radius === 1 ? 6 : 2;
      else if (occupied(ctx, cx, cy, m.id)) factor = FLOCK_RADIUS - radius + 1;
      else continue;
      x += -dx * factor;
      y += -dy * factor;
    }
  }
  return { x, y };
}

function stepIfFree(m: Movable, dir: Direction, ctx: FlockContext): boolean {
  const d = deltaOf(dir);
  const to = { x: m.pos.x + d.dx, y: m.pos.y + d.dy };
  const blockers = flockBlockers(ctx, m.id);
  if (!isWalkable(ctx.grid, to.x, to.y, blockers)) return false;
  m.pathTo(ctx.grid, to, blockers);
  return true;
}

function stepRandomFree(m: Movable, ctx: FlockContext): boolean {
  const start = ctx.rng.nextInt(DIRECTIONS.length);
  for (let i = 0; i < DIRECTIONS.length; i++) {
    if (stepIfFree(m, DIRECTIONS[(start + i) % DIRECTIONS.length]!, ctx)) return true;
  }
  return false;
}

function flockBlockers(ctx: FlockContext, ignoreId: number) {
  return {
    blocks: (x: number, y: number) => ctx.objects.blocks(x, y) || ctx.buildings.blocks(x, y) || occupied(ctx, x, y, ignoreId),
  };
}

function occupied(ctx: FlockContext, x: number, y: number, ignoreId: number): boolean {
  for (const u of ctx.units) {
    if (u.id === ignoreId || u.inside) continue;
    if (u.pos.x === x && u.pos.y === y) return true;
  }
  return false;
}
