/**
 * One match's sim: clock, grid, objects, movables. Session ticks this; render reads `view()`.
 */
import type { Action, GridPos } from "../../shared";
import { Clock } from "../clock/clock";
import { tickJob } from "../job/job";
import type { MapGrid } from "../map/mapGrid";
import { ObjectGrid, type MapObjectView } from "../object/object";
import { BEARER_STEP_MS, Movable, type MovableView } from "../movable/movable";
import { isWalkable, nearestWalkable, type Blockers } from "../path/path";

export type ViewSnapshot = {
  tick: number;
  movables: readonly MovableView[];
  objects: readonly MapObjectView[];
};

class Occupancy {
  private readonly at: Int32Array;
  private readonly width: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.at = new Int32Array(width * height);
  }

  idAt(x: number, y: number): number {
    return this.at[y * this.width + x] ?? 0;
  }

  occupy(id: number, x: number, y: number): void {
    this.at[y * this.width + x] = id;
  }

  clear(): void {
    this.at.fill(0);
  }
}

export class World {
  readonly clock = new Clock();
  readonly grid: MapGrid;
  readonly objects: ObjectGrid;
  private readonly occ: Occupancy;
  private readonly units: Movable[] = [];
  private nextId = 1;

  constructor(grid: MapGrid, objects: ObjectGrid = new ObjectGrid(grid.width, grid.height)) {
    this.grid = grid;
    this.objects = objects;
    this.occ = new Occupancy(grid.width, grid.height);
  }

  spawnBearer(at?: GridPos, player = 0): Movable {
    const seed = at ?? { x: (this.grid.width / 2) | 0, y: (this.grid.height / 2) | 0 };
    const pos = nearestWalkable(this.grid, seed, this.objects) ?? seed;
    const m = new Movable(this.nextId++, pos, BEARER_STEP_MS, this.clock.tickMs, player);
    this.units.push(m);
    this.syncOcc();
    return m;
  }

  dispatch(action: Action): void {
    if (action.type === "noop") return;
    const m = this.units.find((u) => u.id === action.id);
    if (!m) return;
    if (action.type === "moveTo") {
      m.goTo(this.grid, action.to, this.blockers(m.id));
      this.syncOcc();
      return;
    }
    if (action.type === "chop") {
      const tree = this.objects.get(action.at.x, action.at.y);
      if (!tree || tree.kind !== "tree") return;
      m.assignJob({ type: "chop", at: action.at });
      tickJob(m, { grid: this.grid, objects: this.objects, blockers: this.blockers(m.id) });
      this.syncOcc();
      return;
    }
    if (action.type === "pickup") {
      const stack = this.objects.get(action.at.x, action.at.y);
      if (!stack || stack.kind !== "stack" || m.material !== "none") return;
      m.assignJob({ type: "pickup", at: action.at });
      tickJob(m, { grid: this.grid, objects: this.objects, blockers: this.blockers(m.id) });
      this.syncOcc();
      return;
    }
    if (action.type === "drop") {
      if (m.material === "none") return;
      if (this.objects.get(action.at.x, action.at.y)) return;
      if (!isWalkable(this.grid, action.at.x, action.at.y, this.objects)) return;
      if (this.occ.idAt(action.at.x, action.at.y) !== 0) return;
      m.assignJob({ type: "drop", at: action.at });
      tickJob(m, { grid: this.grid, objects: this.objects, blockers: this.blockers(m.id) });
      this.syncOcc();
    }
  }

  tick(): void {
    this.clock.tick();
    for (const m of this.units) m.tick();
    for (const m of this.units) {
      tickJob(m, { grid: this.grid, objects: this.objects, blockers: this.blockers(m.id) });
    }
    this.syncOcc();
  }

  view(): ViewSnapshot {
    return {
      tick: this.clock.tickIndex,
      movables: this.units.map((u) => u.view()),
      objects: this.objects.view(),
    };
  }

  canStand(x: number, y: number, ignoreId = 0): boolean {
    return isWalkable(this.grid, x, y, this.blockers(ignoreId));
  }

  private blockers(ignoreId: number): Blockers {
    return {
      blocks: (x, y) => this.objects.blocks(x, y) || (this.occ.idAt(x, y) !== 0 && this.occ.idAt(x, y) !== ignoreId),
    };
  }

  private syncOcc(): void {
    this.occ.clear();
    for (const m of this.units) this.occ.occupy(m.id, m.pos.x, m.pos.y);
  }
}
