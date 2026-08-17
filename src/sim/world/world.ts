/**
 * One match's sim: clock, grid, objects, buildings, movables. Session ticks this; render reads `view()`.
 */
import { HEX_DELTAS, type Action, type GridPos } from "../../shared";
import { Clock } from "../clock/clock";
import { BuildingGrid, canPlace, type Building, type BuildingView } from "../building/building";
import { buildingDef, type BuildingKind } from "../data/buildings";
import { settlers, settlerDef, type SettlerKind } from "../data/settlers";
import { tickJob } from "../job/job";
import { tickMatcher } from "../economy/matcher";
import { tickConstruction } from "../economy/construction";
import type { MapGrid } from "../map/mapGrid";
import { ObjectGrid, type MapObjectView } from "../object/object";
import { Movable, type MovableView } from "../movable/movable";
import { isWalkable, nearestWalkable, type Blockers } from "../path/path";
import { tickProfession } from "../profession/profession";

export type ViewSnapshot = {
  tick: number;
  movables: readonly MovableView[];
  objects: readonly MapObjectView[];
  buildings: readonly BuildingView[];
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
  readonly buildings: BuildingGrid;
  private readonly occ: Occupancy;
  private readonly units: Movable[] = [];
  private nextId = 1;

  constructor(grid: MapGrid, objects: ObjectGrid = new ObjectGrid(grid.width, grid.height)) {
    this.grid = grid;
    this.objects = objects;
    this.buildings = new BuildingGrid(grid.width, grid.height);
    this.occ = new Occupancy(grid.width, grid.height);
  }

  spawnBearer(at?: GridPos, player = 0): Movable {
    return this.spawnSettler("bearer", at, player);
  }

  spawnSettler(kind: SettlerKind, at?: GridPos, player = 0, workplaceId: number | null = null): Movable {
    const def = settlerDef(kind);
    const seed = at ?? { x: (this.grid.width / 2) | 0, y: (this.grid.height / 2) | 0 };
    const pos = nearestWalkable(this.grid, seed, this.blockers()) ?? seed;
    const m = new Movable(this.nextId++, kind, pos, def.stepMs, this.clock.tickMs, player, workplaceId);
    if (def.restMs) {
      m.restLeft = Math.max(0, Math.round(def.restMs / this.clock.tickMs));
      m.enter();
    }
    this.units.push(m);
    this.syncOcc();
    return m;
  }

  placeBuilding(kind: BuildingKind, at: GridPos, player = 0, clear = false) {
    const hut = this.buildings.place(kind, at, player, this.grid, this.objects, clear);
    if (!hut) return undefined;
    this.staffFinished(hut);
    return hut;
  }

  /** Scaffold. Matcher hauls `constructionStacks`; a bearer occupies once built. */
  placePlan(kind: BuildingKind, at: GridPos, player = 0) {
    const hut = this.buildings.place(kind, at, player, this.grid, this.objects);
    if (!hut) return undefined;
    hut.state = "plan";
    return hut;
  }

  canPlaceBuilding(kind: BuildingKind, at: GridPos): boolean {
    return canPlace(this.buildings, buildingDef(kind), at, this.grid, this.objects);
  }

  dispatch(action: Action): void {
    if (action.type === "noop") return;
    if (action.type === "placeBuilding") {
      this.placePlan(action.kind, action.at, action.player ?? 0);
      return;
    }
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
      tickJob(m, this.jobCtx(m.id));
      this.syncOcc();
      return;
    }
    if (action.type === "pickup") {
      const stack = this.objects.get(action.at.x, action.at.y);
      if (!stack || stack.kind !== "stack" || m.material !== "none") return;
      m.assignJob({ type: "pickup", at: action.at });
      tickJob(m, this.jobCtx(m.id));
      this.syncOcc();
      return;
    }
    if (action.type === "drop") {
      if (m.material === "none") return;
      if (this.objects.get(action.at.x, action.at.y)) return;
      if (!isWalkable(this.grid, action.at.x, action.at.y, this.blockers())) return;
      if (this.occ.idAt(action.at.x, action.at.y) !== 0) return;
      m.assignJob({ type: "drop", at: action.at });
      tickJob(m, this.jobCtx(m.id));
      this.syncOcc();
    }
  }

  tick(): void {
    this.clock.tick();
    for (const m of this.units) m.tick();
    this.tickHouses();
    for (const m of this.units) {
      tickProfession(m, {
        grid: this.grid,
        objects: this.objects,
        buildings: this.buildings,
        blockers: this.blockers(m.id),
        tickMs: this.clock.tickMs,
        units: this.units,
      });
    }
    tickConstruction({
      units: this.units,
      buildings: this.buildings,
      objects: this.objects,
      grid: this.grid,
      blockers: (ignoreId) => this.blockers(ignoreId),
      tickMs: this.clock.tickMs,
    });
    tickMatcher(this.units, this.buildings, this.objects);
    for (const m of this.units) {
      tickJob(m, this.jobCtx(m.id));
    }
    this.syncOcc();
  }

  view(): ViewSnapshot {
    return {
      tick: this.clock.tickIndex,
      movables: this.units.map((u) => u.view()),
      objects: this.objects.view(),
      buildings: this.buildings.view(),
    };
  }

  canStand(x: number, y: number, ignoreId = 0): boolean {
    return isWalkable(this.grid, x, y, this.blockers(ignoreId));
  }

  private tickHouses(): void {
    for (const b of this.buildings.all()) {
      const def = buildingDef(b.kind);
      if (!("beds" in def) || !def.beds || b.state !== "built" || b.produced >= def.beds) continue;
      if (b.produceWait > 0) {
        b.produceWait -= 1;
        continue;
      }
      const door = { x: b.pos.x + def.door.dx, y: b.pos.y + def.door.dy };
      const m = this.spawnSettler("bearer", door, b.player);
      b.produced += 1;
      b.produceWait = Math.max(1, Math.round((def.produceMs ?? 2000) / this.clock.tickMs));
      if (m.pos.x === door.x && m.pos.y === door.y) {
        for (const { dx, dy } of HEX_DELTAS) {
          const x = m.pos.x + dx;
          const y = m.pos.y + dy;
          if (!isWalkable(this.grid, x, y, this.blockers(m.id))) continue;
          m.pathTo(this.grid, { x, y }, this.blockers(m.id));
          break;
        }
      }
    }
  }

  private staffFinished(hut: Building): void {
    const def = buildingDef(hut.kind);
    const worker = def.worker;
    if (worker && worker in settlers) {
      const door = def.door;
      this.spawnSettler(worker as SettlerKind, { x: hut.pos.x + door.dx, y: hut.pos.y + door.dy }, hut.player, hut.id);
    }
    if ("beds" in def && def.beds) hut.produceWait = Math.max(1, Math.round((def.produceMs ?? 2000) / this.clock.tickMs));
  }

  private jobCtx(id: number) {
    return { grid: this.grid, objects: this.objects, blockers: this.blockers(id), tickMs: this.clock.tickMs };
  }

  private blockers(ignoreId = 0): Blockers {
    return {
      blocks: (x, y) =>
        this.objects.blocks(x, y) ||
        this.buildings.blocks(x, y) ||
        (this.occ.idAt(x, y) !== 0 && this.occ.idAt(x, y) !== ignoreId),
    };
  }

  private syncOcc(): void {
    this.occ.clear();
    for (const m of this.units) {
      if (m.inside) continue;
      this.occ.occupy(m.id, m.pos.x, m.pos.y);
    }
  }
}
