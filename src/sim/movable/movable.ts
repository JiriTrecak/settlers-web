/**
 * One unit on the grid. Occupies the destination tile at step start; `moveProgress`
 * is 0→1 over `stepTicks` so render can lerp from `from` to `pos`.
 */
import { directionFromDelta, type Direction, type GridPos } from "../../shared";
import type { MapGrid } from "../map/mapGrid";
import { findPath } from "../path/path";

export type MovableType = "bearer";
export type MovableAction = "idle" | "walk";

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
  player: number;
};

export class Movable {
  readonly id: number;
  readonly type: MovableType = "bearer";
  pos: GridPos;
  from: GridPos;
  direction: Direction = "e";
  action: MovableAction = "idle";
  moveProgress = 0;
  readonly stepTicks: number;
  readonly player: number;

  private queue: GridPos[] = [];
  private stepElapsed = 0;
  private stepping = false;

  constructor(id: number, pos: GridPos, stepMs: number, tickMs: number, player = 0) {
    this.id = id;
    this.pos = pos;
    this.from = pos;
    this.stepTicks = Math.max(1, Math.round(stepMs / tickMs));
    this.player = player;
  }

  view(): MovableView {
    return {
      id: this.id,
      type: this.type,
      pos: this.pos,
      from: this.from,
      direction: this.direction,
      action: this.action,
      moveProgress: this.moveProgress,
      stepTicks: this.stepTicks,
      player: this.player,
    };
  }

  /** Replace the remaining path. The current tile-step always finishes. */
  goTo(grid: MapGrid, to: GridPos): void {
    const path = findPath(grid, this.pos, to);
    this.queue = path ? path.slice() : [];
    if (!this.stepping) this.startStep();
  }

  tick(): void {
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

  private startStep(): void {
    const next = this.queue.shift();
    if (!next) {
      this.action = "idle";
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
