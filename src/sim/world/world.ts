/**
 * One match's sim: clock, grid, objects, buildings, land, fog, marks, movables.
 * Session ticks this and enqueues Actions; render reads `view()`.
 */
import { HEX_DELTAS, TOWER_RADIUS, isWater, type Action, type GridPos } from "../../shared";
import { Clock } from "../clock/clock";
import { TickTimer, type TickTimings } from "../clock/profile";
import { BuildingGrid, buildingFlag, canPlace, TOWER_DOOR_HP, type Building, type BuildingView } from "../building/building";
import { averageHeight, constructionMarkValue, flattenTooSteep, footprint, needsFlatten, plotLevel as heightsMatch } from "../building/flatten";
import { buildingDef, type BuildingKind } from "../data/buildings";
import { settlers, settlerDef, needsPlayersGround, unitViewDistance, isSoldier, type SettlerKind } from "../data/settlers";
import { tickJob } from "../job/job";
import { tickMatcher } from "../economy/matcher";
import { tickConstruction } from "../economy/construction";
import type { MapGrid } from "../map/mapGrid";
import { ObjectGrid, type MapObjectView } from "../object/object";
import { tickTrees } from "../object/tree";
import { Movable, type MovableView } from "../movable/movable";
import { tickFlock } from "../movable/flock";
import { isWalkable, nearestWalkable, type Blockers } from "../path/path";
import { tickProfession, garrisonCount } from "../profession/profession";
import { seedRng, type Rng } from "../rng/rng";
import { LandGrid, type LandView } from "../land/land";
import { FogGrid, buildingViewDistance, type FogView, type FogWorld } from "../fog/fog";
import { MarkGrid } from "../mark/mark";
import { placeColony } from "../economy/startKit";

export type MatchOutcome = {
  winner: number | null;
  defeated: readonly number[];
};

export type ViewSnapshot = {
  tick: number;
  terrainGen: number;
  movables: readonly MovableView[];
  objects: readonly MapObjectView[];
  buildings: readonly BuildingView[];
  land?: LandView;
  fog: FogView;
  outcome: MatchOutcome | null;
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
  private readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.at = new Int32Array(width * height);
  }

  idAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.at[y * this.width + x] ?? 0;
  }

  occupy(id: number, x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    this.at[y * this.width + x] = id;
  }

  /** Clear only if this id still owns the cell — someone else may have stepped in. */
  leave(id: number, x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.width + x;
    if (this.at[i] === id) this.at[i] = 0;
  }

  clear(): void {
    this.at.fill(0);
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
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
  private readonly hqPlayers = new Set<number>();
  /** Set once a colony HQ is gone. */
  outcome: MatchOutcome | null = null;

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

  /** Colony start tower. Capture or destroy knocks that slot out; match ends when one HQ remains. */
  setHq(hut: Building): void {
    hut.hq = true;
    this.hqPlayers.add(hut.player);
  }

  hasHq(player: number): boolean {
    return this.buildings.all().some((b) => b.hq && b.player === player);
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

  movable(id: number): Movable | undefined {
    return this.units.find((u) => u.id === id);
  }

  /** Standing unit on this tile. `inside` units are in a hut. */
  unitAt(x: number, y: number): Movable | undefined {
    return this.units.find((u) => !u.inside && u.pos.x === x && u.pos.y === y);
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
    const def = buildingDef(kind);
    if (needsFlatten(def)) hut.flattenHeight = averageHeight(this.grid, footprint(def.protected, at));
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
        const worker = buildingDef(hut.kind).worker;
        if (worker && m.type === worker) m.become("bearer", null, this.clock.tickMs);
        else m.workplaceId = null;
      } else if (m.job && "hutId" in m.job && m.job.hutId === hut.id) {
        m.idle();
      }
    }
    this.buildings.remove(hut.id);
    this.syncOcc();
    this.fog.tickDim(this.clock.tickMs, this.fogWorld());
    this.checkOutcome();
    return true;
  }

  canPlaceBuilding(kind: BuildingKind, at: GridPos, player = 0): boolean {
    const def = buildingDef(kind);
    if (!canPlace(this.buildings, def, at, this.grid, this.objects)) return false;
    if (needsFlatten(def) && flattenTooSteep(this.grid, footprint(def.protected, at))) return false;
    return this.landAllows(kind, at, player);
  }

  /** True when the hut needs no diggers (`flatten: false`, or protected heights already match). */
  plotLevel(kind: BuildingKind, at: GridPos): boolean {
    const def = buildingDef(kind);
    if (!needsFlatten(def)) return true;
    return heightsMatch(this.grid, footprint(def.protected, at));
  }

  /**
   * Construction-mark byte for placing `kind` here. `null` if illegal.
   * 0 = level (or the hut does not flatten). Higher = more digging, cap 127.
   */
  constructionMark(kind: BuildingKind, at: GridPos, player = 0): number | null {
    if (!this.canPlaceBuilding(kind, at, player)) return null;
    const def = buildingDef(kind);
    if (!needsFlatten(def)) return 0;
    const v = constructionMarkValue(this.grid, footprint(def.protected, at));
    return v < 0 ? null : v;
  }

  /**
   * Every placeable origin on this player's land. `null` if they have no occupy
   * disk yet (session falls back to the viewport). Owned-land scan is the play path.
   */
  constructionMarks(kind: BuildingKind, player = 0): { x: number; y: number; value: number }[] | null {
    if (!this.land.hasPlayer(player)) return null;
    const def = buildingDef(kind);
    const out: { x: number; y: number; value: number }[] = [];
    const w = this.grid.width;
    const h = this.grid.height;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (this.land.playerAt(x, y) !== player) continue;
        if (this.buildings.protects(x, y) || this.objects.blocks(x, y)) continue;
        const land = this.grid.landscapeAt(x, y);
        if (!def.ground.some((g) => g === land)) continue;
        const value = this.constructionMark(kind, { x, y }, player);
        if (value == null) continue;
        out.push({ x, y, value });
      }
    }
    return out;
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
   * `untilTick` (or the last logged beat if omitted). Later actions stay pending.
   */
  replay(entries: readonly LoggedAction[], untilTick?: number): void {
    for (const e of entries) this.enqueue(e.action, e.tick);
    this.applyDue(this.clock.tickIndex);
    const last = entries.reduce((m, e) => Math.max(m, e.tick), this.clock.tickIndex);
    const end = untilTick ?? last;
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
      mix(m.health | 0);
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
      mix(b.flattenHeight);
      mix(b.hq ? 1 : 0);
      mix(b.doorHealth | 0);
    }
    mix(this.outcome?.winner ?? -1);
    mix(this.outcome?.defeated.length ?? 0);
    if (this.outcome) for (const p of this.outcome.defeated) mix(p);
    mix(this.land.width);
    mix(this.land.height);
    for (let y = 0; y < this.land.height; y++) {
      for (let x = 0; x < this.land.width; x++) mix(this.land.playerAt(x, y));
    }
    mix(this.grid.revision);
    for (let i = 0; i < this.grid.heightmap.length; i++) {
      mix(this.grid.heightmap[i]!);
      mix(this.grid.landscape[i]!);
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

  tick(acc?: TickTimings): void {
    const t = new TickTimer(acc);
    this.clock.tick();
    this.applyDue(this.clock.tickIndex);
    t.mark("apply");
    tickTrees(this.objects, this.clock.tickMs);
    t.mark("trees");
    for (const m of this.units) {
      if (m.health <= 0) continue;
      this.commitMove(m, () => m.tick(this.grid, this.unitBlockers(m)));
    }
    t.mark("step");
    this.tickHouses();
    this.syncOcc();
    t.mark("houses");
    for (const m of this.units) {
      if (m.health <= 0) continue;
      this.commitMove(m, () =>
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
        }),
      );
    }
    t.mark("profession");
    tickConstruction({
      units: this.units,
      buildings: this.buildings,
      objects: this.objects,
      grid: this.grid,
      marks: this.marks,
      rng: this.rng,
      blockers: (ignoreId) => this.blockers(ignoreId),
      tickMs: this.clock.tickMs,
    });
    this.syncOcc();
    t.mark("construction");
    tickMatcher(this.units, this.buildings, this.objects, this.land);
    this.syncOcc();
    t.mark("matcher");
    for (const m of this.units) {
      if (m.health <= 0) continue;
      this.commitMove(m, () =>
        tickFlock(m, {
          grid: this.grid,
          objects: this.objects,
          buildings: this.buildings,
          units: this.units,
          rng: this.rng,
          tickMs: this.clock.tickMs,
          land: this.land,
        }),
      );
    }
    t.mark("flock");
    for (const m of this.units) {
      this.commitMove(m, () => tickJob(m, this.jobCtx(m)));
    }
    t.mark("jobs");
    this.tickDoors();
    this.reapDead();
    this.syncLandClaims();
    t.mark("land");
    this.syncFog();
    this.fog.tickDim(this.clock.tickMs, this.fogWorld());
    t.mark("fog");
    this.syncOcc();
    t.mark("occ");
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
    if (
      action.type === "placeColony" ||
      action.type === "placeBuilding" ||
      action.type === "occupy" ||
      action.type === "spawnUnit"
    ) {
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
      placeColony(this, action.at, action.player ?? 0, action.swordsmen);
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
    if (action.type === "spawnUnit") {
      const n = Math.min(100, Math.max(1, action.count ?? 1));
      const player = action.player ?? 0;
      for (let i = 0; i < n; i++) this.spawnSettler(action.kind, action.at, player);
      return;
    }
    const m = this.units.find((u) => u.id === action.id);
    if (!m) return;
    if (action.type === "moveTo") {
      const blockers = this.unitBlockers(m);
      const occId = this.occ.idAt(action.to.x, action.to.y);
      const to =
        occId !== 0 && occId !== m.id
          ? (nearestWalkable(this.grid, action.to, blockers) ?? action.to)
          : action.to;
      m.forcedUntil = action.forced ? to : null;
      m.goTo(this.grid, to, blockers);
      this.syncOcc();
      return;
    }
    if (action.type === "convert") {
      if (action.to === "pioneer") {
        if (m.type !== "bearer" || m.material !== "none") return;
        m.become("pioneer", null, this.clock.tickMs);
      } else if (action.to === "swordsman") {
        if (m.type !== "bearer" || m.material !== "none") return;
        m.become("swordsman", null, this.clock.tickMs);
      } else {
        if (m.type !== "pioneer") return;
        if (this.land.playerAt(m.pos.x, m.pos.y) !== m.player) return;
        m.become("bearer", null, this.clock.tickMs);
      }
      this.syncOcc();
      return;
    }
    if (action.type === "pioneerWork") {
      if (m.type !== "pioneer") return;
      const to = nearestWalkable(this.grid, action.to, this.unitBlockers(m)) ?? action.to;
      m.assignJob({ type: "pioneer", at: to, arrived: false });
      tickJob(m, this.jobCtx(m));
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
      terrainGen: this.grid.revision,
      movables: this.units.map((u) => u.view()),
      objects: this.objects.view(),
      buildings: this.buildings.view(this.units),
      land: this.land.view(),
      fog: this.fog.view(player),
      outcome: this.outcome,
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
    } else if ("occupies" in def && def.occupies && "garrison" in def && (def.garrison ?? 0) > 0) {
      const door = { x: hut.pos.x + def.door.dx, y: hut.pos.y + def.door.dy };
      const m = this.spawnSettler("swordsman", door, hut.player, hut.id);
      m.enter();
      this.syncOcc();
    }
    if ("beds" in def && def.beds) hut.produceWait = Math.max(1, Math.round((def.produceMs ?? 2000) / this.clock.tickMs));
  }

  /** Fog unstamp + drop from the unit list. After jobs so both sides can swing this beat. */
  private reapDead(): void {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const m = this.units[i]!;
      if (m.health > 0) continue;
      m.idle();
      const prev = this.fogAt.get(m.id) ?? null;
      this.fog.moveCircle(m.player, prev, null, unitViewDistance(m.type));
      this.fogAt.delete(m.id);
      this.units.splice(i, 1);
    }
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
      captureTower: (hut: Building, attacker: Movable) => this.captureTower(hut, attacker),
      kickGarrison: (hut: Building) => this.kickGarrison(hut),
    };
  }

  private unitBlockers(m: Movable): Blockers {
    let walkHut: number | undefined;
    if (m.type === "digger" && m.workplaceId != null) walkHut = m.workplaceId;
    if (m.job?.type === "flatten") walkHut = m.job.hutId;
    return this.blockers(m.id, this.groundPlayer(m.type, m.player), walkHut);
  }

  private groundPlayer(kind: SettlerKind, player: number): number | undefined {
    return needsPlayersGround(kind) ? player : undefined;
  }

  /** Objects + buildings + land. Occupancy is `occupied` — BFS walks through units. Diggers walk their hut's footprint, stacks included. */
  private blockers(ignoreId = 0, player?: number, walkHutId?: number): Blockers {
    return {
      blocks: (x, y) => {
        const onHut = walkHutId != null && this.buildings.at(x, y)?.id === walkHutId;
        if (!onHut && this.objects.blocks(x, y)) return true;
        if (!onHut && this.buildings.blocks(x, y)) return true;
        if (player != null && !this.land.owns(x, y, player)) return true;
        return false;
      },
      occupied: (x, y) => {
        const id = this.occ.idAt(x, y);
        return id !== 0 && id !== ignoreId;
      },
    };
  }

  /** Pathing occupancy is live: commit after each unit so the next one sees the new tile. */
  private commitMove(m: Movable, fn: () => void): void {
    const prev = m.pos;
    fn();
    this.occ.leave(m.id, prev.x, prev.y);
    if (!m.inside) this.occ.occupy(m.id, m.pos.x, m.pos.y);
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
    const def = buildingDef(kind);
    if (this.land.ownsFootprint(def.protected, at, player)) return true;
    // First occupying hut of a player may stamp virgin land (second HQ). Extra towers still need owned.
    if (!("occupies" in def) || !def.occupies) return false;
    return !this.land.hasPlayer(player) && this.land.unownedFootprint(def.protected, at);
  }

  private landscapeBlocked(x: number, y: number): boolean {
    if (!this.grid.inBounds(x, y)) return true;
    const t = this.grid.landscapeAt(x, y);
    return isWater(t);
  }

  private claimAt(at: GridPos, player: number): void {
    this.land.occupy(at, player, TOWER_RADIUS, (x, y) => this.landscapeBlocked(x, y));
  }

  /** Military huts stamp their disk while garrisoned; empty ones release it. */
  private syncLandClaims(): void {
    for (const b of this.buildings.all()) {
      const def = buildingDef(b.kind);
      if (!("occupies" in def) || !def.occupies) continue;
      const manned = b.state === "built" && garrisonCount(b, this.units) > 0;
      const incoming = this.units.some(
        (u) => u.job?.type === "occupy" && u.job.hutId === b.id && u.player === b.player,
      );
      const contested =
        incoming ||
        this.units.some((u) => u.job?.type === "assault" && u.job.hutId === b.id) ||
        this.units.some(
          (u) => u.workplaceId === b.id && !u.inside && u.health > 0 && isSoldier(u.type),
        );
      if (manned && !b.landClaimed) {
        this.claimAt(b.pos, b.player);
        b.landClaimed = true;
      } else if (!manned && b.landClaimed && !contested) {
        this.land.release(b.pos, (x, y) => this.landscapeBlocked(x, y));
        b.landClaimed = false;
      }
    }
  }

  private kickGarrison(hut: Building): Movable | null {
    for (const u of this.units) {
      if (u.workplaceId !== hut.id || !u.inside || u.health <= 0 || !isSoldier(u.type)) continue;
      u.leave();
      return u;
    }
    return null;
  }

  private captureTower(hut: Building, attacker: Movable): void {
    const old = hut.player;
    if (old === attacker.player) return;
    if (hut.fogDistance > 0) {
      this.fog.resizeCircle(hut.pos, old, hut.fogDistance, 0);
      hut.fogDistance = 0;
    }
    const held = hut.landClaimed;
    if (held) {
      this.land.release(hut.pos, (x, y) => this.landscapeBlocked(x, y));
      hut.landClaimed = false;
    }
    hut.player = attacker.player;
    hut.hq = false;
    hut.doorHealth = 5;
    hut.doorRegen = 0;
    for (const u of this.units) {
      if (u.job?.type === "occupy" && u.job.hutId === hut.id && u.player !== hut.player) u.idle();
      if (u.workplaceId === hut.id && u.player === old) u.workplaceId = null;
    }
    if (held) {
      this.claimAt(hut.pos, hut.player);
      hut.landClaimed = true;
    }
    this.checkOutcome();
  }

  private tickDoors(): void {
    for (const b of this.buildings.all()) {
      const def = buildingDef(b.kind);
      if (!("occupies" in def) || !def.occupies || b.state !== "built" || b.doorHealth >= TOWER_DOOR_HP) continue;
      if (this.units.some((u) => u.job?.type === "assault" && u.job.hutId === b.id)) continue;
      b.doorRegen += 1;
      if (b.doorRegen < 40) continue;
      b.doorRegen = 0;
      b.doorHealth += 1;
    }
  }

  private checkOutcome(): void {
    if (this.outcome || this.hqPlayers.size === 0) return;
    const defeated = [...this.hqPlayers].filter((p) => !this.hasHq(p));
    if (defeated.length === 0) return;
    const alive = [...this.hqPlayers].filter((p) => !defeated.includes(p));
    if (alive.length > 1) return;
    this.outcome = { winner: alive.length === 1 ? alive[0]! : null, defeated };
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
