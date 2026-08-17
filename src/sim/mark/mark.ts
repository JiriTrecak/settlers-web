/**
 * Work-claim bits. A chop/plant (later stone, corn) sets the resource tile
 * while the job is live so the next search skips it. Not occupancy — units
 * still walk; this is "someone already took that tree."
 */
import type { GridPos } from "../../shared";

export class MarkGrid {
  readonly width: number;
  readonly height: number;
  private readonly at: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.at = new Uint8Array(width * height);
  }

  claimed(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return this.at[y * this.width + x] === 1;
  }

  claim(at: GridPos): void {
    if (!this.inBounds(at.x, at.y)) return;
    this.at[at.y * this.width + at.x] = 1;
  }

  release(at: GridPos): void {
    if (!this.inBounds(at.x, at.y)) return;
    this.at[at.y * this.width + at.x] = 0;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }
}
