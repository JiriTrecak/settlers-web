/** Path is a request: live queue stays, missed dest is not BFS'd every beat. */
import { describe, expect, it } from "vitest";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { Movable } from "../../src/sim/movable/movable";

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

function bearer(pos: { x: number; y: number }): Movable {
  return new Movable(1, "bearer", pos, 450, 25);
}

describe("ensurePath", () => {
  it("keeps the live queue instead of rebuilding", () => {
    const grid = grass(16, 8);
    const m = bearer({ x: 1, y: 4 });
    expect(m.pathTo(grid, { x: 12, y: 4 })).toBe(true);
    expect(m.headingToward({ x: 12, y: 4 })).toBe(true);
    const path = m.view().path.map((p) => ({ x: p.x, y: p.y }));
    expect(m.ensurePath(grid, { x: 12, y: 4 })).toBe(true);
    expect(m.view().path).toEqual(path);
  });

  it("does not retry an unreachable dest the next call", () => {
    const grid = grass(24, 8);
    for (let y = 0; y < 8; y++) grid.setLandscape(12, y, "water8");
    const m = bearer({ x: 2, y: 4 });
    const dest = { x: 20, y: 4 };
    expect(m.pathTo(grid, dest)).toBe(false);
    expect(m.pathTo(grid, dest)).toBe(false);
    expect(m.pathTo(grid, { x: 3, y: 4 })).toBe(true);
  });
});
