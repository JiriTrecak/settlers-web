import { describe, expect, it } from "vitest";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { ObjectGrid } from "../../src/sim/object/object";
import { findPath, isWalkable } from "../../src/sim/path/path";
import { CHOP_TICKS, World } from "../../src/sim";

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

describe("object grid", () => {
  it("blocks walking onto a tree", () => {
    const grid = grass(8, 8);
    const objects = new ObjectGrid(8, 8);
    objects.place({ kind: "tree", x: 4, y: 3, sheet: 0, capacity: 0, stateProgress: 1 });
    expect(isWalkable(grid, 4, 3, objects)).toBe(false);
    expect(isWalkable(grid, 3, 3, objects)).toBe(true);
    const path = findPath(grid, { x: 2, y: 3 }, { x: 6, y: 3 }, objects);
    expect(path).not.toBeNull();
    expect(path!.some((p) => p.x === 4 && p.y === 3)).toBe(false);
    expect(path!.at(-1)).toEqual({ x: 6, y: 3 });
  });
});

describe("chop", () => {
  it("walks adjacent then removes the tree", () => {
    const objects = new ObjectGrid(12, 12);
    objects.place({ kind: "tree", x: 5, y: 3, sheet: 1, capacity: 0, stateProgress: 1 });
    const world = new World(grass(12, 12), objects);
    const bearer = world.spawnBearer({ x: 3, y: 3 });
    world.dispatch({ type: "chop", id: bearer.id, at: { x: 5, y: 3 } });
    let n = 0;
    while (world.objects.get(5, 3) && n < 400) {
      world.tick();
      n++;
    }
    expect(world.objects.get(5, 3)).toBeUndefined();
    expect(world.view().movables[0]!.action).toBe("idle");
    expect(n).toBeGreaterThan(CHOP_TICKS);
  });

  it("moveTo cancels an in-progress chop", () => {
    const objects = new ObjectGrid(12, 12);
    objects.place({ kind: "tree", x: 4, y: 3, sheet: 0, capacity: 0, stateProgress: 1 });
    const world = new World(grass(12, 12), objects);
    const bearer = world.spawnBearer({ x: 3, y: 3 });
    world.dispatch({ type: "chop", id: bearer.id, at: { x: 4, y: 3 } });
    for (let i = 0; i < 8; i++) world.tick();
    world.dispatch({ type: "moveTo", id: bearer.id, to: { x: 3, y: 5 } });
    expect(world.view().movables[0]!.action).not.toBe("work");
    for (let i = 0; i < CHOP_TICKS + 40; i++) world.tick();
    expect(world.objects.get(4, 3)?.kind).toBe("tree");
  });
});
