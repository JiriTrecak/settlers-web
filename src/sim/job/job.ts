/**
 * A unit's assignment. Movable only walks/works; `tickJob` is the verb.
 */
import type { GridPos } from "../../shared";
import type { MapGrid } from "../map/mapGrid";
import type { Movable } from "../movable/movable";
import { isAdjacent, trunkStack, type ObjectGrid } from "../object/object";
import { standBeside, type Blockers } from "../path/path";

export type Job = { type: "chop"; at: GridPos } | { type: "pickup"; at: GridPos } | { type: "drop"; at: GridPos };

/** Chop duration: 1.8s at 25ms. */
export const CHOP_TICKS = 72;

/** Bend clip is 4 frames; 8 ticks = 200ms. Pickup and drop share it. */
export const BEND_TICKS = 8;
export const PICKUP_TICKS = BEND_TICKS;
export const DROP_TICKS = BEND_TICKS;

export type JobContext = {
  grid: MapGrid;
  objects: ObjectGrid;
  blockers: Blockers;
};

export function workTicksOf(job: Job | null): number {
  if (job?.type === "chop") return CHOP_TICKS;
  if (job?.type === "pickup" || job?.type === "drop") return BEND_TICKS;
  return 1;
}

export function tickJob(m: Movable, ctx: JobContext): void {
  const job = m.job;
  if (!job) return;
  if (job.type === "chop") tickChop(m, job.at, ctx);
  else if (job.type === "pickup") tickPickup(m, job.at, ctx);
  else tickDrop(m, job.at, ctx);
}

function tickChop(m: Movable, target: GridPos, ctx: JobContext): void {
  const tree = ctx.objects.get(target.x, target.y);
  if (!tree || tree.kind !== "tree") {
    m.idle();
    return;
  }
  if (!readyToWork(m, target, ctx)) return;
  if (m.action !== "work") {
    m.beginWork();
    m.workElapsed = 0;
  }
  m.workElapsed += 1;
  tree.stateProgress = Math.max(0, 1 - m.workElapsed / CHOP_TICKS);
  if (m.workElapsed >= CHOP_TICKS) {
    ctx.objects.remove(target.x, target.y);
    ctx.objects.place(trunkStack(target));
    m.idle();
  }
}

function tickPickup(m: Movable, target: GridPos, ctx: JobContext): void {
  const stack = ctx.objects.get(target.x, target.y);
  if (!stack || stack.kind !== "stack" || m.material !== "none") {
    m.idle();
    return;
  }
  if (!readyToWork(m, target, ctx)) return;
  if (m.action !== "work") {
    m.beginWork();
    m.workElapsed = 0;
  }
  m.workElapsed += 1;
  if (m.workElapsed >= BEND_TICKS) {
    ctx.objects.remove(target.x, target.y);
    m.material = "trunk";
    m.idle();
  }
}

function tickDrop(m: Movable, target: GridPos, ctx: JobContext): void {
  if (m.material === "none" || ctx.objects.get(target.x, target.y)) {
    m.idle();
    return;
  }
  if (!readyToWork(m, target, ctx)) return;
  if (m.action !== "work") {
    m.beginWork();
    m.workElapsed = 0;
  }
  m.workElapsed += 1;
  if (m.workElapsed >= BEND_TICKS) {
    ctx.objects.place(trunkStack(target));
    m.material = "none";
    m.idle();
  }
}

/** Face the tile and work, or path to a free neighbor. `idle()` if boxed in. */
function readyToWork(m: Movable, target: GridPos, ctx: JobContext): boolean {
  if (isAdjacent(m.pos, target) && !m.walking) {
    m.face(target);
    return true;
  }
  if (m.walking) return false;
  const stand = standBeside(ctx.grid, target, m.pos, ctx.blockers);
  if (!stand) {
    m.idle();
    return false;
  }
  m.pathTo(ctx.grid, stand, ctx.blockers);
  return false;
}
