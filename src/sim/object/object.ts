/**
 * One object per tile: trees and stones. Blocks walking; `stateProgress` is chop/grow.
 */
import { HEX_DELTAS, type GridPos } from "../../shared";
import type { MapGrid } from "../map/mapGrid";
import { treeSheetAt } from "../decorations/decorations";
import type { DumpedMap } from "../map/dumpedMap";
import type { Rng } from "../rng/rng";

export type MapObjectKind = "tree" | "stone";

export type MapObjectView = {
  kind: MapObjectKind;
  x: number;
  y: number;
  sheet: number;
  capacity: number;
  /** 1 = intact, 0 = gone (removed). Chopping interpolates. */
  stateProgress: number;
};

export class ObjectGrid {
  readonly width: number;
  readonly height: number;
  /** 0 = empty, else 1-based index into `items`. */
  private readonly at: Int32Array;
  private readonly items: (MapObjectView | null)[] = [null];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.at = new Int32Array(width * height);
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
    return obj ?? undefined;
  }

  view(): MapObjectView[] {
    const out: MapObjectView[] = [];
    for (const obj of this.items) {
      if (obj) out.push({ ...obj });
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
