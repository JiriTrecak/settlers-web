import { describe, expect, it } from "vitest";
import { MarkGrid } from "../../src/sim/mark/mark";
import { markOf } from "../../src/sim/job/job";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { ObjectGrid } from "../../src/sim/object/object";
import { World } from "../../src/sim/world/world";

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

describe("MarkGrid", () => {
  it("claims and releases a tile", () => {
    const marks = new MarkGrid(8, 8);
    expect(marks.claimed(3, 4)).toBe(false);
    marks.claim({ x: 3, y: 4 });
    expect(marks.claimed(3, 4)).toBe(true);
    expect(marks.claimed(3, 5)).toBe(false);
    marks.release({ x: 3, y: 4 });
    expect(marks.claimed(3, 4)).toBe(false);
  });

  it("markOf locks the tree for chop and the plant cell for plant", () => {
    expect(markOf({ type: "chop", at: { x: 5, y: 6 } })).toEqual({ x: 5, y: 6 });
    expect(markOf({ type: "plant", at: { x: 2, y: 3 } })).toEqual({ x: 2, y: 4 });
    expect(markOf({ type: "drop", at: { x: 1, y: 1 } })).toBeNull();
  });
});

describe("job marks", () => {
  it("chop marks the tree until idle", () => {
    const objects = new ObjectGrid(16, 16);
    objects.place({ kind: "tree", x: 8, y: 8, sheet: 0, capacity: 0, stateProgress: 1 });
    const world = new World(grass(16, 16), objects);
    const bearer = world.spawnBearer({ x: 6, y: 8 });
    world.dispatch({ type: "chop", id: bearer.id, at: { x: 8, y: 8 } });
    expect(world.marks.claimed(8, 8)).toBe(true);
    while (world.objects.get(8, 8)?.kind === "tree") world.tick();
    expect(world.marks.claimed(8, 8)).toBe(false);
  });
});
