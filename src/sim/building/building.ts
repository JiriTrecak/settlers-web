/**
 * Buildings on the map. Footprint from the def: `blocked` is unwalkable,
 * `protected` forbids overlapping another hut. `plan` is fence posts while
 * goods (and flatten) arrive, `building` grows scaffold then hut, `built` is finished.
 *
 * Flags: workerless huts fly `door` from placement. Worker huts fly `roof` only
 * while their own worker has `workplaceId` — bricklayers on the scaffold do not count.
 */
import type { GridPos, LandscapeType } from "../../shared";
import { buildingDef, type BuildingKind } from "../data/buildings";
import type { MapGrid } from "../map/mapGrid";
import type { ObjectGrid } from "../object/object";

export type BuildingState = "plan" | "building" | "built";

/** `door` = no-worker hut. `roof` = worker hut with its worker inside/assigned. */
export type BuildingFlag = "door" | "roof";

export type BuildingView = {
  id: number;
  kind: BuildingKind;
  x: number;
  y: number;
  player: number;
  state: BuildingState;
  /** 0 at plan, 0→1 while bricklayers hammer, 1 when finished. Drives the built-sprite mask. */
  buildProgress: number;
  flag: BuildingFlag | null;
};

/** Door from placement for workerless huts; roof only when the def's worker occupies. */
export function buildingFlag(
  b: { id: number; kind: BuildingKind },
  units: readonly { type: string; workplaceId: number | null }[],
): BuildingFlag | null {
  const worker = buildingDef(b.kind).worker;
  if (!worker) return "door";
  return units.some((m) => m.workplaceId === b.id && m.type === worker) ? "roof" : null;
}

export class Building {
  readonly id: number;
  readonly kind: BuildingKind;
  readonly pos: GridPos;
  readonly player: number;
  state: BuildingState = "built";

  produceWait = 0;
  produced = 0;
  /** 0→1 in discrete hammer bumps (`1 / (12 × construction materials)` each). */
  constructionProgress = 0;
  /** Actions left on the current board/stone before the next pile is popped. */
  remainingMaterialActions = 0;
  /** True after this hut's occupy disk has been stamped. */
  landClaimed = false;
  /** Last view-circle radius stamped into fog. */
  fogDistance = 0;
  /** Integer mean of protected heights, frozen when the plan drops. Unused if the def has no `flatten`. */
  flattenHeight = 0;

  constructor(id: number, kind: BuildingKind, pos: GridPos, player: number) {
    this.id = id;
    this.kind = kind;
    this.pos = pos;
    this.player = player;
  }

  view(flag: BuildingFlag | null = null): BuildingView {
    return {
      id: this.id,
      kind: this.kind,
      x: this.pos.x,
      y: this.pos.y,
      player: this.player,
      state: this.state,
      buildProgress: this.state === "built" ? 1 : this.constructionProgress,
      flag,
    };
  }
}

export class BuildingGrid {
  readonly width: number;
  readonly height: number;
  private readonly blockedAt: Int32Array;
  private readonly protectedAt: Int32Array;
  private readonly items: (Building | null)[] = [null];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.blockedAt = new Int32Array(width * height);
    this.protectedAt = new Int32Array(width * height);
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(id: number): Building | undefined {
    return this.items[id] ?? undefined;
  }

  all(): Building[] {
    const out: Building[] = [];
    for (const b of this.items) if (b) out.push(b);
    return out;
  }

  at(x: number, y: number): Building | undefined {
    if (!this.inBounds(x, y)) return undefined;
    const id = this.protectedAt[this.index(x, y)]!;
    return id ? (this.items[id] ?? undefined) : undefined;
  }

  blocks(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true;
    return this.blockedAt[this.index(x, y)] !== 0;
  }

  protects(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true;
    return this.protectedAt[this.index(x, y)] !== 0;
  }

  view(units: readonly { type: string; workplaceId: number | null }[] = []): BuildingView[] {
    const out: BuildingView[] = [];
    for (const b of this.items) {
      if (b) out.push(b.view(buildingFlag(b, units)));
    }
    return out;
  }

  /**
   * Stamps the footprint. Caller sets `state` (`plan` vs finished).
   * `clear` removes objects on the protected tiles (match-start HQ).
   * Returns undefined if the footprint is illegal.
   */
  place(
    kind: BuildingKind,
    at: GridPos,
    player: number,
    land: MapGrid,
    objects: ObjectGrid,
    clear = false,
  ): Building | undefined {
    const def = buildingDef(kind);
    if (!footprintInBounds(this, def.protected, at)) return undefined;
    if (clear) {
      for (const t of tiles(def.protected, at)) objects.remove(t.x, t.y);
    }
    if (!canPlace(this, def, at, land, objects)) return undefined;
    const id = this.items.length;
    const building = new Building(id, kind, at, player);
    this.items.push(building);
    for (const t of tiles(def.protected, at)) this.protectedAt[this.index(t.x, t.y)] = id;
    for (const t of tiles(def.blocked, at)) this.blockedAt[this.index(t.x, t.y)] = id;
    return building;
  }

  /** Clears the footprint. Ids are not reused. */
  remove(id: number): Building | undefined {
    const b = this.items[id];
    if (!b) return undefined;
    const def = buildingDef(b.kind);
    for (const t of tiles(def.protected, b.pos)) {
      const i = this.index(t.x, t.y);
      if (this.protectedAt[i] === id) this.protectedAt[i] = 0;
    }
    for (const t of tiles(def.blocked, b.pos)) {
      const i = this.index(t.x, t.y);
      if (this.blockedAt[i] === id) this.blockedAt[i] = 0;
    }
    this.items[id] = null;
    return b;
  }
}

export function canPlace(
  buildings: BuildingGrid,
  def: { ground: readonly LandscapeType[]; blocked: readonly { dx: number; dy: number }[]; protected: readonly { dx: number; dy: number }[] },
  at: GridPos,
  land: MapGrid,
  objects: ObjectGrid,
): boolean {
  if (!footprintInBounds(buildings, def.protected, at)) return false;
  for (const t of tiles(def.protected, at)) {
    if (buildings.protects(t.x, t.y) || buildings.blocks(t.x, t.y)) return false;
    if (objects.blocks(t.x, t.y)) return false;
    if (!def.ground.includes(land.landscapeAt(t.x, t.y))) return false;
  }
  return true;
}

function footprintInBounds(grid: BuildingGrid, rels: readonly { dx: number; dy: number }[], at: GridPos): boolean {
  return rels.every((r) => grid.inBounds(at.x + r.dx, at.y + r.dy));
}

function tiles(rels: readonly { dx: number; dy: number }[], at: GridPos): GridPos[] {
  return rels.map((r) => ({ x: at.x + r.dx, y: at.y + r.dy }));
}
