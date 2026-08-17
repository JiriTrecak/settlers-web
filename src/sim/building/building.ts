/**
 * Buildings on the map. Footprint from the def: `blocked` is unwalkable,
 * `protected` forbids overlapping another hut. Plans wait for hauled goods; `built` is finished.
 */
import type { GridPos, LandscapeType } from "../../shared";
import { buildingDef, type BuildingKind } from "../data/buildings";
import type { MapGrid } from "../map/mapGrid";
import type { ObjectGrid } from "../object/object";

export type BuildingState = "plan" | "built";

export type BuildingView = {
  id: number;
  kind: BuildingKind;
  x: number;
  y: number;
  player: number;
  state: BuildingState;
};

export class Building {
  readonly id: number;
  readonly kind: BuildingKind;
  readonly pos: GridPos;
  readonly player: number;
  state: BuildingState = "built";

  produceWait = 0;
  produced = 0;

  constructor(id: number, kind: BuildingKind, pos: GridPos, player: number) {
    this.id = id;
    this.kind = kind;
    this.pos = pos;
    this.player = player;
  }

  view(): BuildingView {
    return { id: this.id, kind: this.kind, x: this.pos.x, y: this.pos.y, player: this.player, state: this.state };
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

  view(): BuildingView[] {
    const out: BuildingView[] = [];
    for (const b of this.items) {
      if (b) out.push(b.view());
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
