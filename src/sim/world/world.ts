/**
 * One match's sim: clock, grid, objects, movables. Session ticks this; render reads `view()`.
 */
import type { Action, GridPos } from "../../shared";
import { Clock } from "../clock/clock";
import type { MapGrid } from "../map/mapGrid";
import { ObjectGrid, isAdjacent, type MapObjectView } from "../object/object";
import { BEARER_STEP_MS, CHOP_TICKS, Movable, type MovableView } from "../movable/movable";
import { isWalkable, nearestWalkable, standBeside, type Blockers } from "../path/path";

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
      m.chop(action.at);
      this.advanceJob(m);
      this.syncOcc();
    }
  }

  tick(): void {
    this.clock.tick();
    for (const m of this.units) m.tick();
    for (const m of this.units) this.advanceJob(m);
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

  private advanceJob(m: Movable): void {
    const target = m.chopAt;
    if (!target) return;
    const tree = this.objects.get(target.x, target.y);
    if (!tree || tree.kind !== "tree") {
      m.idle();
      return;
    }
    const blockers = this.blockers(m.id);
    if (isAdjacent(m.pos, target) && !m.walking) {
      m.face(target);
      if (m.action !== "work") {
        m.beginWork();
        m.workElapsed = 0;
      }
      m.workElapsed += 1;
      tree.stateProgress = Math.max(0, 1 - m.workElapsed / CHOP_TICKS);
      if (m.workElapsed >= CHOP_TICKS) {
        this.objects.remove(target.x, target.y);
        m.idle();
      }
      return;
    }
    if (m.walking) return;
    const stand = standBeside(this.grid, target, m.pos, blockers);
    if (!stand) {
      m.idle();
      return;
    }
    m.pathTo(this.grid, stand, blockers);
    m.chopAt = target;
  }
}
