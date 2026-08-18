/**
 * One object per tile: trees, stones, stacks. Blocks walking; `stateProgress` is chop/grow.
 * Stones shrink via `capacity` (remaining cuts).
 */
import { HEX_DELTAS, type GridPos } from "../../shared";
import type { Goods } from "../data/types";
import type { MapGrid } from "../map/mapGrid";
import { treeSheetAt } from "../decorations/decorations";
import type { DumpedMap } from "../map/dumpedMap";
import type { Rng } from "../rng/rng";

export type MapObjectKind = "tree" | "stone" | "stack";
export type StackMaterial = Goods;

/** Ground / building stacks hold this many of one material. */
export const STACK_SIZE = 8;

export type MapObjectView = {
  kind: MapObjectKind;
  x: number;
  y: number;
  sheet: number;
  capacity: number;
  /** 1 = intact adult, 0 = gone. Growing trees climb 0→1; chopping falls 1→0. */
  stateProgress: number;
  material?: StackMaterial;
  /** Sapling. Lumberjacks skip these; render uses staged scale, not the fall clip. */
  growing?: boolean;
};

export class ObjectGrid {
  readonly width: number;
  readonly height: number;
  /** Bumps when an object is placed or removed (not stack count). Construction marks cache this. */
  revision = 0;
  /** 0 = empty, else 1-based index into `items`. */
  private readonly at: Int32Array;
  private readonly items: (MapObjectView | null)[] = [null];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.at = new Int32Array(width * height);
  }

  /** Independent copy. Replay seek rebuilds World from this snapshot, then ticks forward. */
  clone(): ObjectGrid {
    const copy = new ObjectGrid(this.width, this.height);
    for (const obj of this.all()) copy.place({ ...obj });
    copy.revision = this.revision;
    return copy;
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): MapObjectView | undefined {
    if (!this.inBounds(x, y)) return undefined;
    const id = this.at[this.index(x, y)]!;
    return id ? (this.items[id] ?? undefined) : undefined;
  }

  blocks(x: number, y: number): boolean {
    return this.get(x, y) !== undefined;
  }

  /** Place on an empty in-bounds tile. No-op if occupied or out of bounds. */
  place(obj: MapObjectView): MapObjectView | undefined {
    if (!this.inBounds(obj.x, obj.y) || this.at[this.index(obj.x, obj.y)]) return undefined;
    const id = this.items.length;
    const stored: MapObjectView = { ...obj };
    this.items.push(stored);
    this.at[this.index(obj.x, obj.y)] = id;
    this.revision += 1;
    return stored;
  }

  remove(x: number, y: number): MapObjectView | undefined {
    if (!this.inBounds(x, y)) return undefined;
    const i = this.index(x, y);
    const id = this.at[i]!;
    if (!id) return undefined;
    const obj = this.items[id];
    this.items[id] = null;
    this.at[i] = 0;
    this.revision += 1;
    return obj ?? undefined;
  }

  view(): MapObjectView[] {
    const out: MapObjectView[] = [];
    for (const obj of this.items) {
      if (obj) out.push({ ...obj });
    }
    return out;
  }

  /** Live objects — growth mutates `stateProgress` in place. */
  all(): MapObjectView[] {
    const out: MapObjectView[] = [];
    for (const obj of this.items) {
      if (obj) out.push(obj);
    }
    return out;
  }
}

export function objectsFromDumpedMap(map: DumpedMap): ObjectGrid {
  const grid = new ObjectGrid(map.width, map.width);
  for (const t of map.trees) {
    grid.place({
      kind: "tree",
      x: t.x,
      y: t.y,
      sheet: t.sheet ?? treeSheetAt(t.x, t.y),
      capacity: 0,
      stateProgress: 1,
    });
  }
  for (const s of map.stones) {
    grid.place({
      kind: "stone",
      x: s.x,
      y: s.y,
      sheet: 0,
      capacity: s.capacity,
      stateProgress: 1,
    });
  }
  return grid;
}

/** Sprinkle trees on walkable grass so generated maps can chop too. */
export function scatterTrees(land: MapGrid, objects: ObjectGrid, rng: Rng, density = 0.025): void {
  for (let y = 0; y < land.height; y++) {
    for (let x = 0; x < land.width; x++) {
      const t = land.landscapeAt(x, y);
      if (t !== "grass" || objects.blocks(x, y)) continue;
      if (rng.nextFloat() > density) continue;
      objects.place({
        kind: "tree",
        x,
        y,
        sheet: treeSheetAt(x, y),
        capacity: 0,
        stateProgress: 1,
      });
    }
  }
}

export function isAdjacent(a: GridPos, b: GridPos): boolean {
  return HEX_DELTAS.some((d) => a.x + d.dx === b.x && a.y + d.dy === b.y);
}

/** One pile on the ground or a building slot. */
export function goodsStack(at: GridPos, material: StackMaterial, capacity = 1): MapObjectView {
  return {
    kind: "stack",
    x: at.x,
    y: at.y,
    sheet: 0,
    capacity,
    stateProgress: 1,
    material,
  };
}

/** One trunk on the ground. Chop and drop both place this. */
export function trunkStack(at: GridPos): MapObjectView {
  return goodsStack(at, "trunk");
}

/** Empty tile, or a same-material stack with room. */
export function canDeposit(objects: ObjectGrid, at: GridPos, material: StackMaterial): boolean {
  const cur = objects.get(at.x, at.y);
  if (!cur) return true;
  return cur.kind === "stack" && cur.material === material && cur.capacity < STACK_SIZE;
}

/** Place a new stack or increment an existing one. False if the tile is full / wrong. */
export function addToStack(objects: ObjectGrid, at: GridPos, material: StackMaterial): boolean {
  const cur = objects.get(at.x, at.y);
  if (!cur) return objects.place(goodsStack(at, material)) !== undefined;
  if (cur.kind !== "stack" || cur.material !== material || cur.capacity >= STACK_SIZE) return false;
  cur.capacity += 1;
  return true;
}
