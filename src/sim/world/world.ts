/**
 * One match's sim: clock, grid, movables. Session ticks this; render reads `view()`.
 */
import type { Action, GridPos } from "../../shared";
import { Clock } from "../clock/clock";
import type { MapGrid } from "../map/mapGrid";
import { BEARER_STEP_MS, Movable, type MovableView } from "../movable/movable";
import { nearestWalkable } from "../path/path";

export type ViewSnapshot = {
  tick: number;
  movables: readonly MovableView[];
};

export class World {
  readonly clock = new Clock();
  readonly grid: MapGrid;
  private readonly units: Movable[] = [];
  private nextId = 1;

  constructor(grid: MapGrid) {
    this.grid = grid;
  }

  spawnBearer(at?: GridPos, player = 0): Movable {
    const seed = at ?? { x: (this.grid.width / 2) | 0, y: (this.grid.height / 2) | 0 };
    const pos = nearestWalkable(this.grid, seed) ?? seed;
    const m = new Movable(this.nextId++, pos, BEARER_STEP_MS, this.clock.tickMs, player);
    this.units.push(m);
    return m;
  }

  dispatch(action: Action): void {
    if (action.type === "noop") return;
    if (action.type === "moveTo") {
      const m = this.units.find((u) => u.id === action.id);
      if (!m) return;
      m.goTo(this.grid, action.to);
    }
  }

  tick(): void {
    this.clock.tick();
    for (const m of this.units) m.tick();
  }

  view(): ViewSnapshot {
    return {
      tick: this.clock.tickIndex,
      movables: this.units.map((m) => m.view()),
    };
  }
}
