/**
 * One match's sim: clock, grid, objects, buildings, land, fog, marks, movables.
 * Session ticks this and enqueues Actions; render reads `view()`.
 */
import { HEX_DELTAS, TOWER_RADIUS, isRiver, isWater, type Action, type GridPos } from "../../shared";
import { Clock } from "../clock/clock";
import { BuildingGrid, buildingFlag, canPlace, type Building, type BuildingView } from "../building/building";
import { buildingDef, type BuildingKind } from "../data/buildings";
import { settlers, settlerDef, needsPlayersGround, unitViewDistance, type SettlerKind } from "../data/settlers";
import { tickJob } from "../job/job";
import { tickMatcher } from "../economy/matcher";
import { tickConstruction } from "../economy/construction";
import type { MapGrid } from "../map/mapGrid";
import { ObjectGrid, type MapObjectView } from "../object/object";
import { tickTrees } from "../object/tree";
import { Movable, type MovableView } from "../movable/movable";
import { tickFlock } from "../movable/flock";
import { isWalkable, nearestWalkable, type Blockers } from "../path/path";
import { tickProfession } from "../profession/profession";
import { seedRng, type Rng } from "../rng/rng";
import { LandGrid, type LandView } from "../land/land";
import { FogGrid, buildingViewDistance, type FogView, type FogWorld } from "../fog/fog";
import { MarkGrid } from "../mark/mark";
import { placeColony } from "../economy/startKit";

export type ViewSnapshot = {
  tick: number;
  movables: readonly MovableView[];
  objects: readonly MapObjectView[];
  buildings: readonly BuildingView[];
  land?: LandView;
  fog: FogView;
};

/** Applied action. Log is append-only at apply time, not enqueue. */
export type LoggedAction = {
  tick: number;
  player: number;
  action: Action;
};

type QueuedAction = LoggedAction & { seq: number };

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
  readonly land: LandGrid;
  readonly fog: FogGrid;
  readonly marks: MarkGrid;
  readonly rng: Rng;
  private readonly occ: Occupancy;
  private readonly units: Movable[] = [];
  private readonly fogAt = new Map<number, GridPos>();
  private nextId = 1;
  private nextSeq = 0;
  private readonly pending: QueuedAction[] = [];
  private readonly applied: LoggedAction[] = [];

  constructor(grid: MapGrid, objects: ObjectGrid = new ObjectGrid(grid.width, grid.height), rng: Rng = seedRng(1)) {
    this.grid = grid;
    this.objects = objects;
    this.buildings = new BuildingGrid(grid.width, grid.height);
    this.land = new LandGrid(grid.width, grid.height);
    this.fog = new FogGrid(grid.width, grid.height);
    this.marks = new MarkGrid(grid.width, grid.height);
    this.occ = new Occupancy(grid.width, grid.height);
    this.rng = rng;
  }

  spawnBearer(at?: GridPos, player = 0): Movable {
    return this.spawnSettler("bearer", at, player);
  }

  spawnSettler(kind: SettlerKind, at?: GridPos, player = 0, workplaceId: number | null = null): Movable {
    const def = settlerDef(kind);
    const seed = at ?? { x: (this.grid.width / 2) | 0, y: (this.grid.height / 2) | 0 };
    const pos = nearestWalkable(this.grid, seed, this.blockers(0, this.groundPlayer(kind, player))) ?? seed;
    const m = new Movable(this.nextId++, kind, pos, def.stepMs, this.clock.tickMs, player, workplaceId, this.marks);
    if (def.restMs) {
      m.restLeft = Math.max(0, Math.round(def.restMs / this.clock.tickMs));
      m.enter();
    }
    this.units.push(m);
    this.syncOcc();
    this.noteFogUnit(m);
    return m;
  }

  placeBuilding(kind: BuildingKind, at: GridPos, player = 0, clear = false) {
    if (!clear && !this.canPlaceBuilding(kind, at, player)) return undefined;
    if (clear && !this.landAllows(kind, at, player)) return undefined;
    const hut = this.buildings.place(kind, at, player, this.grid, this.objects, clear);
    if (!hut) return undefined;
    this.staffFinished(hut);
    this.syncLandClaims();
    this.syncFog();
    this.fog.tickDim(this.clock.tickMs, this.fogWorld());
    return hut;
  }

  /** Instantly walk sight to the current ref target. Match start skips the fade-in. */
  snapFog(): void {
    this.syncFog();
    this.fog.tickDim(10_000, this.fogWorld());
  }

  /** Scaffold. Matcher hauls `constructionStacks`; bricklayers hammer; a bearer occupies once built. */
  placePlan(kind: BuildingKind, at: GridPos, player = 0) {
    if (!this.canPlaceBuilding(kind, at, player)) return undefined;
    const hut = this.buildings.place(kind, at, player, this.grid, this.objects);
    if (!hut) return undefined;
    hut.state = "plan";
    return hut;
  }

  /**
   * Instant remove. Unstamps fog + occupy land, kicks the worker out as a
   * bearer, cancels jobs aimed at this hut. Sight dims toward 50 on the next ticks.
   */
  destroyBuilding(at: GridPos): boolean {
    const hut = this.buildings.at(at.x, at.y);
    if (!hut) return false;
    if (hut.fogDistance > 0) {
      this.fog.resizeCircle(hut.pos, hut.player, hut.fogDistance, 0);
      hut.fogDistance = 0;
    }
    if (hut.landClaimed) {
      this.land.release(hut.pos, (x, y) => this.landscapeBlocked(x, y));
      hut.landClaimed = false;
    }
    for (const m of this.units) {
      if (m.workplaceId === hut.id) {
        m.leave();
        m.become("bearer", null, this.clock.tickMs);
      } else if (m.job && "hutId" in m.job && m.job.hutId === hut.id) {
        m.idle();
      }
    }
    this.buildings.remove(hut.id);
    this.syncOcc();
    this.fog.tickDim(this.clock.tickMs, this.fogWorld());
    return true;
  }

  canPlaceBuilding(kind: BuildingKind, at: GridPos, player = 0): boolean {
    if (!canPlace(this.buildings, buildingDef(kind), at, this.grid, this.objects)) return false;
    return this.landAllows(kind, at, player);
  }

  /** Actions applied so far, in apply order. */
  log(): readonly LoggedAction[] {
    return this.applied;
  }

  /**
   * Schedule `action` for a sim beat. Default is the *next* beat (`tickIndex + 1`)
   * so session input never lands mid-tick. Due-or-past ticks apply immediately.
   */
  enqueue(action: Action, atTick = this.clock.tickIndex + 1): void {
    if (action.type === "noop") return;
    const item: QueuedAction = {
      tick: atTick,
      player: this.actionPlayer(action),
      action,
      seq: this.nextSeq++,
    };
    if (atTick <= this.clock.tickIndex) {
      this.applyItems([item]);
      return;
    }
    this.pending.push(item);
  }

  /** Test helper: enqueue for *now* and apply immediately. */
  dispatch(action: Action): void {
    this.enqueue(action, this.clock.tickIndex);
  }

  /**
   * Replay a log onto an empty world. Applies tick-0 actions, then ticks until
   * the last logged beat (and no further).
   */
  replay(entries: readonly LoggedAction[]): void {
    for (const e of entries) this.enqueue(e.action, e.tick);
    this.applyDue(this.clock.tickIndex);
    const end = entries.reduce((m, e) => Math.max(m, e.tick), this.clock.tickIndex);
    while (this.clock.tickIndex < end) this.tick();
  }

  /** Integer mix of tick, RNG, units, huts, land owners, objects. Fog is not in it. */
  checksum(): number {
    let h = 2166136261 | 0;
    const mix = (v: number): void => {
      h = Math.imul(h ^ (v | 0), 0x9e3779b1) | 0;
    };
    const mixStr = (s: string): void => {
      mix(s.length);
      for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i));
    };
    mix(this.clock.tickIndex);
    mix(this.rng.state());
    const units = this.units.slice().sort((a, b) => a.id - b.id);
    mix(units.length);
    for (const m of units) {
      mix(m.id);
      mix(m.pos.x);
      mix(m.pos.y);
      mixStr(m.type);
      mix(m.player);
      mixStr(m.job?.type ?? "");
      mixStr(m.material);
      mix(m.inside ? 1 : 0);
      mix(m.workplaceId ?? 0);
    }
    const huts = this.buildings.all().slice().sort((a, b) => a.id - b.id);
    mix(huts.length);
    for (const b of huts) {
      mix(b.id);
      mixStr(b.kind);
      mix(b.pos.x);
      mix(b.pos.y);
      mixStr(b.state);
      mix((b.constructionProgress * 1000) | 0);
      mix(b.player);
    }
    mix(this.land.width);
    mix(this.land.height);
    for (let y = 0; y < this.land.height; y++) {
      for (let x = 0; x < this.land.width; x++) mix(this.land.playerAt(x, y));
    }
    const objs = this.objects.all().sort((a, b) => a.y - b.y || a.x - b.x);
    mix(objs.length);
    for (const o of objs) {
      mixStr(o.kind);
      mix(o.x);
      mix(o.y);
      mix(o.capacity);
      mix((o.stateProgress * 1000) | 0);
    }
    return h >>> 0;
  }

  tick(): void {
    this.clock.tick();
    this.applyDue(this.clock.tickIndex);
    tickTrees(this.objects, this.clock.tickMs);
    for (const m of this.units) m.tick();
    this.tickHouses();
    for (const m of this.units) {
      tickProfession(m, {
        grid: this.grid,
        objects: this.objects,
        buildings: this.buildings,
        blockers: this.unitBlockers(m),
        tickMs: this.clock.tickMs,
        units: this.units,
        rng: this.rng,
        land: this.land,
        marks: this.marks,
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
    tickMatcher(this.units, this.buildings, this.objects, this.land);
    for (const m of this.units) {
      tickFlock(m, {
        grid: this.grid,
        objects: this.objects,
        buildings: this.buildings,
        units: this.units,
        rng: this.rng,
        tickMs: this.clock.tickMs,
        land: this.land,
      });
    }
    for (const m of this.units) {
      tickJob(m, this.jobCtx(m));
    }
    this.syncLandClaims();
    this.syncFog();
    this.fog.tickDim(this.clock.tickMs, this.fogWorld());
    this.syncOcc();
  }

  private applyDue(tick: number): void {
    const due: QueuedAction[] = [];
    const rest: QueuedAction[] = [];
    for (const item of this.pending) {
      if (item.tick <= tick) due.push(item);
      else rest.push(item);
    }
    this.pending.length = 0;
    this.pending.push(...rest);
    this.applyItems(due);
  }

  private applyItems(items: QueuedAction[]): void {
    items.sort((a, b) => a.player - b.player || a.seq - b.seq);
    for (const item of items) {
      this.applyAction(item.action);
      this.applied.push({ tick: item.tick, player: item.player, action: item.action });
    }
  }

  private actionPlayer(action: Action): number {
    if (action.type === "placeColony" || action.type === "placeBuilding" || action.type === "occupy") {
      return action.player ?? 0;
    }
    if (action.type === "destroyBuilding") {
      return this.buildings.at(action.at.x, action.at.y)?.player ?? 0;
    }
    if (action.type === "noop") return 0;
    return this.units.find((u) => u.id === action.id)?.player ?? 0;
  }

  private applyAction(action: Action): void {
    if (action.type === "noop") return;
    if (action.type === "placeColony") {
      placeColony(this, action.at, action.player ?? 0);
      return;
    }
    if (action.type === "placeBuilding") {
      this.placePlan(action.kind, action.at, action.player ?? 0);
      return;
    }
    if (action.type === "occupy") {
      this.claimAt(action.at, action.player ?? 0);
      return;
    }
    if (action.type === "destroyBuilding") {
      this.destroyBuilding(action.at);
      return;
    }
    const m = this.units.find((u) => u.id === action.id);
    if (!m) return;
    if (action.type === "moveTo") {
      m.goTo(this.grid, action.to, this.unitBlockers(m));
      this.syncOcc();
      return;
    }
    if (action.type === "chop") {
      const tree = this.objects.get(action.at.x, action.at.y);
      if (!tree || tree.kind !== "tree" || tree.growing) return;
      m.assignJob({ type: "chop", at: action.at });
      tickJob(m, this.jobCtx(m));
      this.syncOcc();
      return;
    }
    if (action.type === "pickup") {
      const stack = this.objects.get(action.at.x, action.at.y);
      if (!stack || stack.kind !== "stack" || m.material !== "none") return;
      m.assignJob({ type: "pickup", at: action.at });
      tickJob(m, this.jobCtx(m));
      this.syncOcc();
      return;
    }
    if (action.type === "drop") {
      if (m.material === "none") return;
      if (this.objects.get(action.at.x, action.at.y)) return;
      if (!isWalkable(this.grid, action.at.x, action.at.y, this.blockers())) return;
      if (this.occ.idAt(action.at.x, action.at.y) !== 0) return;
      m.assignJob({ type: "drop", at: action.at });
      tickJob(m, this.jobCtx(m));
      this.syncOcc();
    }
  }

  view(player = 0): ViewSnapshot {
    return {
      tick: this.clock.tickIndex,
      movables: this.units.map((u) => u.view()),
      objects: this.objects.view(),
      buildings: this.buildings.view(this.units),
      land: this.land.view(),
      fog: this.fog.view(player),
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
          if (!isWalkable(this.grid, x, y, this.unitBlockers(m))) continue;
          m.pathTo(this.grid, { x, y }, this.unitBlockers(m));
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

  private jobCtx(m: Movable) {
    return {
      grid: this.grid,
      objects: this.objects,
      blockers: this.unitBlockers(m),
      tickMs: this.clock.tickMs,
      buildings: this.buildings,
      units: this.units,
      land: this.land,
      marks: this.marks,
    };
  }

  private unitBlockers(m: Movable): Blockers {
    return this.blockers(m.id, this.groundPlayer(m.type, m.player));
  }

  private groundPlayer(kind: SettlerKind, player: number): number | undefined {
    return needsPlayersGround(kind) ? player : undefined;
  }

  /** Occupancy + objects + buildings. `player` set → own-land tiles only. */
  private blockers(ignoreId = 0, player?: number): Blockers {
    return {
      blocks: (x, y) =>
        this.objects.blocks(x, y) ||
        this.buildings.blocks(x, y) ||
        (this.occ.idAt(x, y) !== 0 && this.occ.idAt(x, y) !== ignoreId) ||
        (player != null && !this.land.owns(x, y, player)),
    };
  }

  private syncOcc(): void {
    this.occ.clear();
    for (const m of this.units) {
      if (m.inside) continue;
      this.occ.occupy(m.id, m.pos.x, m.pos.y);
    }
  }

  private landAllows(kind: BuildingKind, at: GridPos, player: number): boolean {
    if (!this.land.hasLand()) return true;
    return this.land.ownsFootprint(buildingDef(kind).protected, at, player);
  }

  private landscapeBlocked(x: number, y: number): boolean {
    if (!this.grid.inBounds(x, y)) return true;
    const t = this.grid.landscapeAt(x, y);
    return isWater(t) || isRiver(t);
  }

  private claimAt(at: GridPos, player: number): void {
    this.land.occupy(at, player, TOWER_RADIUS, (x, y) => this.landscapeBlocked(x, y));
  }

  /** Finished occupying buildings stamp their disk once. */
  private syncLandClaims(): void {
    for (const b of this.buildings.all()) {
      if (b.landClaimed || b.state !== "built") continue;
      const def = buildingDef(b.kind);
      if (!("occupies" in def) || !def.occupies) continue;
      this.claimAt(b.pos, b.player);
      b.landClaimed = true;
    }
  }

  /** Resize hut/unit view circles when state or tile changes. */
  private syncFog(): void {
    for (const b of this.buildings.all()) {
      const occupied = this.hutOccupied(b);
      const vd = buildingViewDistance(b.kind, b.state, occupied);
      if (vd === b.fogDistance) continue;
      this.fog.resizeCircle(b.pos, b.player, b.fogDistance, vd);
      b.fogDistance = vd;
    }
    for (const m of this.units) {
      const vd = unitViewDistance(m.type);
      const prev = this.fogAt.get(m.id) ?? null;
      const at = { x: m.pos.x, y: m.pos.y };
      if (prev && prev.x === at.x && prev.y === at.y) continue;
      this.fog.moveCircle(m.player, prev, at, vd);
      this.fogAt.set(m.id, at);
    }
  }

  private noteFogUnit(m: Movable): void {
    const vd = unitViewDistance(m.type);
    const prev = this.fogAt.get(m.id) ?? null;
    const at = { x: m.pos.x, y: m.pos.y };
    this.fog.moveCircle(m.player, prev, at, vd);
    this.fogAt.set(m.id, at);
  }

  private hutOccupied(b: Building): boolean {
    const worker = buildingDef(b.kind).worker;
    if (!worker) return false;
    return this.units.some((m) => m.workplaceId === b.id && m.type === worker);
  }

  private fogWorld(): FogWorld {
    return {
      landscapeAt: (x, y) => this.grid.landscapeAt(x, y),
      heightAt: (x, y) => this.grid.heightAt(x, y),
      objectAt: (x, y) => this.objects.get(x, y),
      buildingAt: (x, y) => {
        const b = this.buildings.at(x, y);
        if (!b || b.pos.x !== x || b.pos.y !== y) return undefined;
        return b.view(buildingFlag(b, this.units));
      },
    };
  }
}
