/**
 * One unit on the grid. Occupies the destination tile at step start; `moveProgress`
 * is 0→1 over `stepTicks` so render can lerp from `from` to `pos`.
 */
import { directionFromDelta, type Direction, type GridPos } from "../../shared";
import type { Goods } from "../data/types";
import { settlerDef, type SettlerKind } from "../data/settlers";
import type { Job } from "../job/job";
import { workTicksOf } from "../job/job";
import type { MapGrid } from "../map/mapGrid";
import { findPath, type Blockers } from "../path/path";

export type MovableType = SettlerKind;
export type MovableAction = "idle" | "walk" | "work";
export type MovableMaterial = "none" | Goods;

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
  /** Hidden in the workplace. Still in the unit list; not on a tile. */
  inside: boolean;
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

  private queue: GridPos[] = [];
  private stepElapsed = 0;
  private stepping = false;

  constructor(
    id: number,
    type: MovableType,
    pos: GridPos,
    stepMs: number,
    tickMs: number,
    player = 0,
    workplaceId: number | null = null,
  ) {
    this.id = id;
    this.type = type;
    this.pos = pos;
    this.from = pos;
    this.stepTicks = Math.max(1, Math.round(stepMs / tickMs));
    this.player = player;
    this.workplaceId = workplaceId;
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
      inside: this.inside,
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

  /** Bearer → workplace profession. Enters the hut if that def has `restMs`. */
  become(kind: SettlerKind, workplaceId: number, tickMs: number): void {
    this.type = kind;
    this.workplaceId = workplaceId;
    const def = settlerDef(kind);
    this.stepTicks = Math.max(1, Math.round(def.stepMs / tickMs));
    this.job = null;
    this.workElapsed = 0;
    this.material = "none";
    this.queue = [];
    this.stepping = false;
    this.action = "idle";
    this.moveProgress = 0;
    this.from = this.pos;
    if (def.restMs) {
      this.restLeft = Math.max(0, Math.round(def.restMs / tickMs));
      this.enter();
    }
  }

  /** Assign a job. Does not cancel an in-flight step. Pops out of the hut. */
  assignJob(job: Job): void {
    this.leave();
    this.job = job;
    this.workElapsed = 0;
    this.queue = [];
    if (this.action === "work") this.action = "idle";
  }

  /** Queue a path without touching `job`. Current step still finishes. Pops out of the hut. */
  pathTo(grid: MapGrid, to: GridPos, blockers?: Blockers): void {
    this.leave();
    const path = findPath(grid, this.pos, to, blockers);
    this.queue = path ? path.slice() : [];
    if (!this.stepping && this.action !== "work") this.startStep();
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
    this.action = "idle";
    this.stepping = false;
    this.moveProgress = 0;
    this.workElapsed = 0;
    this.job = null;
    this.from = this.pos;
  }

  tick(): void {
    if (this.inside || this.action === "work") return;
    if (!this.stepping) {
      this.startStep();
      return;
    }
    this.stepElapsed += 1;
    this.moveProgress = this.stepElapsed / this.stepTicks;
    if (this.stepElapsed < this.stepTicks) return;
    this.moveProgress = 1;
    this.stepping = false;
    this.from = this.pos;
    this.moveProgress = 0;
    this.startStep();
  }

  private clearJob(): void {
    this.job = null;
    this.workElapsed = 0;
    if (this.action === "work") this.action = "idle";
  }

  private startStep(): void {
    const next = this.queue.shift();
    if (!next) {
      this.action = this.action === "work" ? "work" : "idle";
      this.stepping = false;
      this.moveProgress = 0;
      this.from = this.pos;
      return;
    }
    this.direction = directionFromDelta(next.x - this.pos.x, next.y - this.pos.y);
    this.from = this.pos;
    this.pos = next;
    this.action = "walk";
    this.stepElapsed = 0;
    this.moveProgress = 0;
    this.stepping = true;
  }
}
