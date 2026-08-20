/** Mutable tile grid: landscape type + height + underground resource per cell. Row-major. */
import {
  HEX_DELTAS,
  LANDSCAPE_TYPES,
  landscapeIndex,
  type LandscapeType,
} from "../../shared";
import { MAX_RESOURCE, resourceKindAt, resourceTypeIndex, type ResourceKind, type TileResource } from "./resource";

export class MapGrid {
  readonly width: number;
  readonly height: number;
  readonly landscape: Uint8Array;
  readonly heightmap: Int8Array;
  /** 0 = none, else 1-based `RESOURCE_KINDS`. */
  readonly resourceType: Uint8Array;
  /** 0–`MAX_RESOURCE`. */
  readonly resourceAmount: Uint8Array;
  /** Bumps when height or landscape type changes. Renderer patches dirty cells. */
  revision = 0;

  constructor(width: number, height: number) {
    if (width < 2 || height < 2) {
      throw new Error("Map too small");
    }
    this.width = width;
    this.height = height;
    const n = width * height;
    this.landscape = new Uint8Array(n);
    this.heightmap = new Int8Array(n);
    this.resourceType = new Uint8Array(n);
    this.resourceAmount = new Uint8Array(n);
  }

  /** Independent copy so replay seek can rebuild from the dump without mutating this one. */
  clone(): MapGrid {
    const copy = new MapGrid(this.width, this.height);
    copy.landscape.set(this.landscape);
    copy.heightmap.set(this.heightmap);
    copy.resourceType.set(this.resourceType);
    copy.resourceAmount.set(this.resourceAmount);
    copy.revision = this.revision;
    return copy;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  landscapeAt(x: number, y: number): LandscapeType {
    return LANDSCAPE_TYPES[this.landscape[this.index(x, y)]] ?? "grass";
  }

  setLandscape(x: number, y: number, type: LandscapeType): void {
    const i = this.index(x, y);
    const next = landscapeIndex[type];
    if (this.landscape[i] === next) return;
    this.landscape[i] = next;
    this.revision += 1;
  }

  heightAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.heightmap[this.index(x, y)];
  }

  setHeight(x: number, y: number, value: number): void {
    const i = this.index(x, y);
    const next = Math.max(-128, Math.min(127, Math.round(value)));
    if (this.heightmap[i] === next) return;
    this.heightmap[i] = next;
    this.revision += 1;
  }

  resourceAt(x: number, y: number): TileResource | null {
    if (!this.inBounds(x, y)) return null;
    const i = this.index(x, y);
    const kind = resourceKindAt(this.resourceType[i]!);
    const amount = this.resourceAmount[i]!;
    if (!kind || amount <= 0) return null;
    return { kind, amount };
  }

  /** Subtract 1 if this tile holds `kind`. Clears at 0. Does not bump `revision`. */
  takeResource(x: number, y: number, kind: ResourceKind): boolean {
    const res = this.resourceAt(x, y);
    if (!res || res.kind !== kind) return false;
    const next = res.amount - 1;
    this.setResource(x, y, next > 0 ? kind : null, next);
    return true;
  }

  /** Does not bump `revision` — the mesh does not change. */
  setResource(x: number, y: number, kind: ResourceKind | null, amount = 0): void {
    if (!this.inBounds(x, y)) return;
    const i = this.index(x, y);
    if (!kind || amount <= 0) {
      this.resourceType[i] = 0;
      this.resourceAmount[i] = 0;
      return;
    }
    this.resourceType[i] = resourceTypeIndex(kind);
    this.resourceAmount[i] = Math.max(1, Math.min(MAX_RESOURCE, amount | 0));
  }

  hasNeighbor(x: number, y: number, pred: (t: LandscapeType) => boolean): boolean {
    for (const { dx, dy } of HEX_DELTAS) {
      const nx = x + dx;
      const ny = y + dy;
      if (this.inBounds(nx, ny) && pred(this.landscapeAt(nx, ny))) return true;
    }
    return false;
  }
}
