/**
 * A unit's assignment. Movable only walks/works; `tickJob` is the verb.
 */
import type { GridPos } from "../../shared";
import type { Goods } from "../data/types";
import { settlerDef } from "../data/settlers";
import type { MapGrid } from "../map/mapGrid";
import type { Movable, MovableType } from "../movable/movable";
import { addToStack, canDeposit, isAdjacent, trunkStack, type ObjectGrid, type StackMaterial } from "../object/object";
import { standBeside, type Blockers } from "../path/path";

export type Job =
  | { type: "chop"; at: GridPos }
  | { type: "pickup"; at: GridPos }
  | { type: "drop"; at: GridPos }
  | { type: "deliver"; material: Goods; from: GridPos; to: GridPos }
  | { type: "saw"; at: GridPos };

/** Chop duration: 1.8s at 25ms for click-chop. Lumberjack uses `chopMs` (6s of axe loops). */
export const CHOP_TICKS = 72;

/** Default tree-fall window when the settler has no `fallMs`. */
export const FALL_TICKS = 20;

/** Bend clip is 4 frames; 8 ticks = 200ms. Pickup and drop share it. */
export const BEND_TICKS = 8;
export const PICKUP_TICKS = BEND_TICKS;
export const DROP_TICKS = BEND_TICKS;

export type JobContext = {
  grid: MapGrid;
  objects: ObjectGrid;
  blockers: Blockers;
};

export function workTicksOf(job: Job | null, type: MovableType = "bearer"): number {
  if (job?.type === "chop") {
    if (type === "lumberjack") {
      const ms = settlerDef("lumberjack").chopMs;
      if (ms != null) return Math.max(1, Math.round(ms / 25));
    }
    return CHOP_TICKS;
  }
  if (job?.type === "saw") {
    const ms = settlerDef("sawmiller").chopMs;
    return Math.max(1, Math.round(ms / 25));
  }
  if (job?.type === "pickup" || job?.type === "drop" || job?.type === "deliver") return BEND_TICKS;
  return 1;
}

function fallTicksOf(m: Movable, chopTicks: number): number {
  const ms = m.type === "lumberjack" ? settlerDef("lumberjack").fallMs : undefined;
  const ticks = ms != null ? Math.max(1, Math.round(ms / 25)) : FALL_TICKS;
  return Math.min(ticks, chopTicks);
}

export function tickJob(m: Movable, ctx: JobContext): void {
  const job = m.job;
  if (!job) return;
  if (job.type === "chop") tickChop(m, job.at, ctx);
  else if (job.type === "pickup") tickPickup(m, job.at, ctx, true);
  else if (job.type === "drop") tickDrop(m, job.at, ctx, true);
  else if (job.type === "deliver") tickDeliver(m, job, ctx);
  else tickSaw(m, job.at, ctx);
}

function tickChop(m: Movable, target: GridPos, ctx: JobContext): void {
  const tree = ctx.objects.get(target.x, target.y);
  if (!tree || tree.kind !== "tree") {
    m.idle();
    return;
  }
  if (!readyToWork(m, target, ctx)) return;
  const ticks = workTicksOf(m.job, m.type);
  if (m.action !== "work") {
    m.beginWork();
    m.workElapsed = 0;
  }
  m.workElapsed += 1;
  const fallTicks = fallTicksOf(m, ticks);
  tree.stateProgress = m.workElapsed + fallTicks >= ticks ? Math.max(0, (ticks - m.workElapsed) / fallTicks) : 1;
  if (m.workElapsed >= ticks) {
    ctx.objects.remove(target.x, target.y);
    if (m.type === "lumberjack") m.material = "trunk";
    else ctx.objects.place(trunkStack(target));
    m.idle();
  }
}

function tickPickup(m: Movable, target: GridPos, ctx: JobContext, finish: boolean): boolean {
  if (m.material !== "none") {
    if (finish) m.idle();
    return true;
  }
  const stack = ctx.objects.get(target.x, target.y);
  if (!stack || stack.kind !== "stack" || !stack.material) {
    m.idle();
    return false;
  }
  if (!readyToWork(m, target, ctx)) return false;
  if (m.action !== "work") {
    m.beginWork();
    m.workElapsed = 0;
  }
  m.workElapsed += 1;
  if (m.workElapsed < BEND_TICKS) return false;
  const material = stack.material;
  if (stack.capacity <= 1) ctx.objects.remove(target.x, target.y);
  else stack.capacity -= 1;
  m.material = material;
  m.workElapsed = 0;
  if (finish) m.idle();
  else {
    m.action = "idle";
    m.from = m.pos;
  }
  return true;
}

function tickDrop(m: Movable, target: GridPos, ctx: JobContext, finish: boolean): boolean {
  if (m.material === "none") {
    if (finish) m.idle();
    return true;
  }
  if (!canDeposit(ctx.objects, target, m.material)) {
    m.idle();
    return false;
  }
  if (!readyToWork(m, target, ctx)) return false;
  if (m.action !== "work") {
    m.beginWork();
    m.workElapsed = 0;
  }
  m.workElapsed += 1;
  if (m.workElapsed < BEND_TICKS) return false;
  addToStack(ctx.objects, target, m.material);
  m.material = "none";
  m.workElapsed = 0;
  if (finish) m.idle();
  else {
    m.action = "idle";
    m.from = m.pos;
  }
  return true;
}

function tickDeliver(m: Movable, job: Extract<Job, { type: "deliver" }>, ctx: JobContext): void {
  if (m.material === "none") {
    tickPickup(m, job.from, ctx, false);
    return;
  }
  if (m.material !== job.material) {
    m.idle();
    return;
  }
  if (tickDrop(m, job.to, ctx, false)) m.idle();
}

function tickSaw(m: Movable, target: GridPos, ctx: JobContext): void {
  if (m.material !== "trunk") {
    m.idle();
    return;
  }
  if (m.pos.x !== target.x || m.pos.y !== target.y) {
    if (m.walking) return;
    m.pathTo(ctx.grid, target, ctx.blockers);
    return;
  }
  const ticks = workTicksOf(m.job, m.type);
  if (m.action !== "work") {
    m.beginWork();
    m.workElapsed = 0;
  }
  m.workElapsed += 1;
  if (m.workElapsed >= ticks) {
    m.material = "plank";
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

export function stackCount(objects: ObjectGrid, at: GridPos, material: StackMaterial): number {
  const cur = objects.get(at.x, at.y);
  if (!cur || cur.kind !== "stack" || cur.material !== material) return 0;
  return cur.capacity;
}
