import { describe, expect, it } from "vitest";
import { TILE_HEIGHT, TILE_WIDTH, gridToWorld, pickGrid, worldToGrid } from "./iso";

describe("iso", () => {
  it("round-trips grid points at height 0", () => {
    const samples = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 7 },
      { x: 12, y: 9 },
      { x: 31, y: 18 },
    ];
    for (const p of samples) {
      const w = gridToWorld(p.x, p.y, 0);
      const g = worldToGrid(w.x, w.y);
      expect(g.x).toBeCloseTo(p.x, 10);
      expect(g.y).toBeCloseTo(p.y, 10);
      expect(pickGrid(w.x, w.y)).toEqual(p);
    }
  });

  it("uses Java 16×9 diamond", () => {
    const a = gridToWorld(1, 0, 0);
    const b = gridToWorld(0, 1, 0);
    expect(a.x - gridToWorld(0, 0, 0).x).toBe(TILE_WIDTH);
    expect(b.x - gridToWorld(0, 0, 0).x).toBe(-TILE_WIDTH / 2);
    expect(b.y - gridToWorld(0, 0, 0).y).toBe(TILE_HEIGHT);
  });

  it("drops height on pick like Java", () => {
    const w = gridToWorld(5, 8, 12);
    const flat = gridToWorld(5, 8, 0);
    expect(pickGrid(flat.x, flat.y)).toEqual({ x: 5, y: 8 });
    expect(w.y).toBe(flat.y - 24);
  });
});
