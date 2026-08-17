import { describe, expect, it } from "vitest";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { ObjectGrid } from "../../src/sim/object/object";
import { isWalkable } from "../../src/sim/path/path";
import { World } from "../../src/sim/world/world";
import { tower } from "../../src/sim/data/buildings/tower";

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

describe("buildings", () => {
  it("places a finished tower and blocks its footprint", () => {
    const world = new World(grass(24, 24));
    const at = { x: 8, y: 8 };
    const hut = world.placeBuilding("tower", at, 0);
    expect(hut).toMatchObject({ kind: "tower", pos: at, player: 0, state: "built" });
    expect(world.view().buildings).toHaveLength(1);
    expect(isWalkable(world.grid, at.x, at.y, world.buildings)).toBe(false);
    const skirt = tower.protected.find((t) => !tower.blocked.some((b) => b.dx === t.dx && b.dy === t.dy))!;
    expect(isWalkable(world.grid, at.x + skirt.dx, at.y + skirt.dy, world.buildings)).toBe(true);
  });

  it("refuses overlap, water, and occupied tiles", () => {
    const world = new World(grass(24, 24));
    expect(world.placeBuilding("tower", { x: 8, y: 8 })).toBeDefined();
    expect(world.placeBuilding("tower", { x: 8, y: 8 })).toBeUndefined();
    expect(world.placeBuilding("lumberjack", { x: 9, y: 8 })).toBeUndefined();
    world.grid.setLandscape(16, 16, "water8");
    expect(world.canPlaceBuilding("lumberjack", { x: 16, y: 16 })).toBe(false);
    world.objects.place({ kind: "tree", x: 18, y: 10, sheet: 0, capacity: 0, stateProgress: 1 });
    expect(world.canPlaceBuilding("lumberjack", { x: 18, y: 10 })).toBe(false);
  });

  it("clears objects on the footprint when asked (start HQ)", () => {
    const objects = new ObjectGrid(24, 24);
    objects.place({ kind: "tree", x: 8, y: 8, sheet: 0, capacity: 0, stateProgress: 1 });
    const world = new World(grass(24, 24), objects);
    expect(world.placeBuilding("tower", { x: 8, y: 8 }, 0, true)?.kind).toBe("tower");
    expect(world.objects.get(8, 8)).toBeUndefined();
  });

  it("placeBuilding action does not need a pre-existing unit", () => {
    const world = new World(grass(24, 24));
    world.dispatch({ type: "placeBuilding", kind: "lumberjack", at: { x: 10, y: 10 } });
    expect(world.view().buildings[0]).toMatchObject({ kind: "lumberjack", x: 10, y: 10 });
    expect(world.view().movables[0]).toMatchObject({ type: "lumberjack", workplaceId: 1 });
  });
});
