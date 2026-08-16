import {
  HEX_DELTAS,
  LANDSCAPE_TYPES,
  landscapeIndex,
  type LandscapeType,
} from "../shared/landscape";

export class MapGrid {
  readonly width: number;
  readonly height: number;
  readonly landscape: Uint8Array;
  readonly heightmap: Int8Array;

  constructor(width: number, height: number) {
    if (width < 2 || height < 2) {
      throw new Error("Map too small");
    }
    this.width = width;
    this.height = height;
    const n = width * height;
    this.landscape = new Uint8Array(n);
    this.heightmap = new Int8Array(n);
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
    this.landscape[this.index(x, y)] = landscapeIndex[type];
  }

  heightAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.heightmap[this.index(x, y)];
  }

  setHeight(x: number, y: number, value: number): void {
    this.heightmap[this.index(x, y)] = Math.max(-128, Math.min(127, Math.round(value)));
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
