/**
 * One unit on the grid. Occupies the destination tile at step start; `moveProgress`
 * is 0→1 over `stepTicks` so render can lerp from `from` to `pos`. Refuses a taken
 * hex: wait, or repath beside the dest if that cell is gone.
 */
import { directionFromDelta, type Direction, type GridPos } from "../../shared";
import type { Goods, SettlerDef } from "../data/types";
import { settlerDef, type SettlerKind } from "../data/settlers";
import type { Job } from "../job/job";
import { markOf, workTicksOf } from "../job/job";
import type { MarkGrid } from "../mark/mark";
import type { MapGrid } from "../map/mapGrid";
import { findPath, isWalkable, nearestWalkable, type Blockers } from "../path/path";

export type MovableType = SettlerKind;
export type MovableAction = "idle" | "walk" | "work";
export type MovableMaterial = "none" | Goods | "tree";

/** Bearer step is 0.6s × 0.75 speedup = 450ms → 18 ticks at 25ms. */
export const BEARER_STEP_MS = 450;

export type MovableView = {
  id: number;
  type: MovableType;
  pos: GridPos;
  from: GridPos;
  direction: Direction;
  action: MovableAction;
  moveProgress: number;
  stepTicks: number;
  workProgress: number;
  workTicks: number;
  player: number;
  material: MovableMaterial;
  job: Job["type"] | null;
  workplaceId: number | null;
  health: number;
  /** Hidden in the workplace. Still in the unit list; not on a tile. */
  inside: boolean;
  /** Remaining waypoints after the current step dest (`pos`). Empty when idle. */
  path: readonly GridPos[];
};

export class Movable {
  readonly id: number;
  type: MovableType;
  workplaceId: number | null;
  pos: GridPos;
  from: GridPos;
  direction: Direction = "e";
  action: MovableAction = "idle";
  moveProgress = 0;
  stepTicks: number;
  readonly player: number;
  job: Job | null = null;
  workElapsed = 0;
  material: MovableMaterial = "none";
  /** Idle ticks left inside the hut before the next search. */
  restLeft = 0;
  inside = false;
  /** Idle flock: ms between checks when not crowded. */
  flockDelayMs = 700;
  flockLeft = 0;
  health: number;
  /** Forced walk: ignore aggro until this step finishes. */
  forcedUntil: GridPos | null = null;

  private queue: GridPos[] = [];
  private stepElapsed = 0;
  private stepping = false;
  private marked: GridPos | null = null;
  private readonly marks: MarkGrid | null;

  constructor(
    id: number,
    type: MovableType,
    pos: GridPos,
    stepMs: number,
    tickMs: number,
    player = 0,
    workplaceId: number | null = null,
    marks: MarkGrid | null = null,
  ) {
    this.id = id;
    this.type = type;
    this.pos = pos;
    this.from = pos;
    this.stepTicks = Math.max(1, Math.round(stepMs / tickMs));
    this.player = player;
    this.workplaceId = workplaceId;
    this.marks = marks;
    const start: SettlerDef = settlerDef(type);
    this.health = start.health ?? 100;
  }

  view(): MovableView {
    const workTicks = workTicksOf(this.job, this.type);
    return {
      id: this.id,
      type: this.type,
      pos: this.pos,
      from: this.from,
      direction: this.direction,
      action: this.action,
      moveProgress: this.moveProgress,
      stepTicks: this.stepTicks,
      workProgress: this.action === "work" ? this.workElapsed / workTicks : 0,
      workTicks,
      player: this.player,
      material: this.material,
      job: this.job?.type ?? null,
      workplaceId: this.workplaceId,
      health: this.health,
      inside: this.inside,
      path: this.queue.map((p) => ({ x: p.x, y: p.y })),
    };
  }

  get walking(): boolean {
    return this.stepping;
  }

  /** Replace the remaining path. The current tile-step always finishes. Drops the job. */
  goTo(grid: MapGrid, to: GridPos, blockers?: Blockers): void {
    this.clearJob();
    this.pathTo(grid, to, blockers);
  }

  /** Hide in the workplace. Occupancy and render skip this unit until `leave`. */
  enter(): void {
    this.inside = true;
    this.action = "idle";
    this.stepping = false;
    this.queue = [];
    this.moveProgress = 0;
    this.from = this.pos;
  }

  leave(): void {
    this.inside = false;
  }

  /** Profession swap. `workplaceId` is null when reverting bricklayer → bearer. Enters if `restMs`. */
  become(kind: SettlerKind, workplaceId: number | null, tickMs: number): void {
    this.type = kind;
    this.workplaceId = workplaceId;
    const def: SettlerDef = settlerDef(kind);
    this.stepTicks = Math.max(1, Math.round(def.stepMs / tickMs));
    this.releaseMark();
    this.job = null;
    this.workElapsed = 0;
    this.material = "none";
    this.queue = [];
    this.stepping = false;
    this.action = "idle";
    this.moveProgress = 0;
    this.from = this.pos;
    this.flockDelayMs = 700;
    this.flockLeft = 0;
    this.forcedUntil = null;
    this.health = def.health ?? 100;
    if (def.restMs) {
      this.restLeft = Math.max(0, Math.round(def.restMs / tickMs));
      this.enter();
    }
  }

  /** Assign a job. Does not cancel an in-flight step. Pops out of the hut. Claims the resource tile. */
  assignJob(job: Job): void {
    this.releaseMark();
    this.leave();
    this.job = job;
    this.workElapsed = 0;
    this.queue = [];
    if (this.action === "work") this.action = "idle";
    const at = markOf(job);
    if (at && this.marks) {
      this.marks.claim(at);
      this.marked = at;
    }
  }

  /** Queue a path without touching `job`. Current step still finishes. Pops out of the hut. False if no path. */
  pathTo(grid: MapGrid, to: GridPos, blockers?: Blockers): boolean {
    this.leave();
    const path = findPath(grid, this.pos, to, blockers);
    this.queue = path ? path.slice() : [];
    if (!this.stepping && this.action !== "work") this.startStep(grid, blockers);
    return path != null;
  }

  /** Already at `to`, or the remaining queue ends there — don't BFS again. */
  headingToward(to: GridPos): boolean {
    if (this.pos.x === to.x && this.pos.y === to.y) return true;
    const last = this.queue[this.queue.length - 1];
    return last != null && last.x === to.x && last.y === to.y;
  }

  face(toward: GridPos): void {
    this.direction = directionFromDelta(toward.x - this.pos.x, toward.y - this.pos.y);
  }

  beginWork(): void {
    this.queue = [];
    this.stepping = false;
    this.action = "work";
    this.moveProgress = 0;
    this.from = this.pos;
  }

  idle(): void {
    this.releaseMark();
    this.action = "idle";
    this.stepping = false;
    this.moveProgress = 0;
    this.workElapsed = 0;
    this.job = null;
    this.from = this.pos;
  }

  tick(grid?: MapGrid, blockers?: Blockers): void {
    if (this.inside || this.action === "work") return;
    if (!this.stepping) {
      this.startStep(grid, blockers);
      return;
    }
    this.stepElapsed += 1;
    this.moveProgress = this.stepElapsed / this.stepTicks;
    if (this.stepElapsed < this.stepTicks) return;
    this.moveProgress = 1;
    this.stepping = false;
    this.from = this.pos;
    this.moveProgress = 0;
    this.startStep(grid, blockers);
  }

  private clearJob(): void {
    this.releaseMark();
    this.job = null;
    this.workElapsed = 0;
    if (this.action === "work") this.action = "idle";
  }

  private releaseMark(): void {
    if (this.marked && this.marks) this.marks.release(this.marked);
    this.marked = null;
  }

  private startStep(grid?: MapGrid, blockers?: Blockers): void {
    this.rerouteIfBlocked(grid, blockers);
    const next = this.queue[0];
    if (!next) {
      this.action = this.action === "work" ? "work" : "idle";
      this.stepping = false;
      this.moveProgress = 0;
      this.from = this.pos;
      return;
    }
    if (blockers?.blocks(next.x, next.y)) {
      this.action = this.action === "work" ? "work" : "idle";
      this.stepping = false;
      this.moveProgress = 0;
      this.from = this.pos;
      return;
    }
    this.queue.shift();
    this.direction = directionFromDelta(next.x - this.pos.x, next.y - this.pos.y);
    this.from = this.pos;
    this.pos = next;
    this.action = "walk";
    this.stepElapsed = 0;
    this.moveProgress = 0;
    this.stepping = true;
  }

  /** Occupied next hex: wait if the dest is still free; otherwise stand beside it. */
  private rerouteIfBlocked(grid?: MapGrid, blockers?: Blockers): void {
    const next = this.queue[0];
    if (!next || !grid || !blockers?.blocks(next.x, next.y)) return;
    const dest = this.queue[this.queue.length - 1] ?? next;
    if (isWalkable(grid, dest.x, dest.y, blockers)) return;
    const alt = nearestWalkable(grid, dest, blockers);
    if (!alt || (alt.x === this.pos.x && alt.y === this.pos.y)) {
      this.queue = [];
      return;
    }
    const path = findPath(grid, this.pos, alt, blockers);
    if (path) this.queue = path.slice();
  }
}
