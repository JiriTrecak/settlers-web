/** Flatten: any hut on a slope waits for diggers; level grass still constructs as today. */
import { describe, expect, it } from "vitest";
import { lumberjack as hutDef } from "../../src/sim/data/buildings/lumberjack";
import { tower as towerDef } from "../../src/sim/data/buildings/tower";
import { averageHeight, constructionMarkFrame, constructionMarkValue, flattenReady, footprint } from "../../src/sim/building/flatten";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { goodsStack } from "../../src/sim/object/object";
import { World } from "../../src/sim/world/world";
import type { Rel } from "../../src/sim/data/types";

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

function tickUntil(world: World, pred: () => boolean, cap = 12_000): number {
  let n = 0;
  while (!pred() && n < cap) {
    world.tick();
    n++;
  }
  return n;
}

function slope(grid: MapGrid, at: { x: number; y: number }, protectedTiles: readonly Rel[]): void {
  for (const r of protectedTiles) {
    grid.setHeight(at.x + r.dx, at.y + r.dy, r.dx < 0 ? 0 : 2);
  }
}

describe("flatten", () => {
  it("lets a level lumberjack construct without diggers", () => {
    const world = new World(grass(48, 48));
    const at = { x: 16, y: 16 };
    expect(world.plotLevel("lumberjack", at)).toBe(true);
    expect(world.placePlan("lumberjack", at, 0)).toBeDefined();
    for (const slot of hutDef.constructionStacks) {
      world.objects.place(goodsStack({ x: at.x + slot.dx, y: at.y + slot.dy }, slot.material, slot.required ?? 1));
    }
    world.spawnBearer({ x: 22, y: 16 }, 0);
    const n = tickUntil(world, () => world.view().buildings[0]?.state === "building", 2000);
    expect(n).toBeGreaterThan(0);
    expect(world.view().movables.some((m) => m.type === "digger" || m.job === "flatten")).toBe(false);
  });

  it("holds a sloped lumberjack in plan until diggers level it", () => {
    const grid = grass(48, 48);
    const at = { x: 20, y: 20 };
    slope(grid, at, hutDef.protected);
    const world = new World(grid);
    expect(world.plotLevel("lumberjack", at)).toBe(false);
    expect(world.canPlaceBuilding("lumberjack", at, 0)).toBe(true);
    const hut = world.placePlan("lumberjack", at, 0)!;
    const tiles = footprint(hutDef.protected, at);
    expect(hut.flattenHeight).toBe(averageHeight(grid, tiles));
    expect(flattenReady(world.grid, tiles, hut.flattenHeight)).toBe(false);

    for (const slot of hutDef.constructionStacks) {
      world.objects.place(goodsStack({ x: at.x + slot.dx, y: at.y + slot.dy }, slot.material, slot.required ?? 1));
    }
    for (let i = 0; i < 6; i++) world.spawnBearer({ x: at.x + 8, y: at.y + i }, 0);

    const sawDigger = tickUntil(
      world,
      () => world.view().movables.some((m) => m.type === "digger" || m.job === "flatten"),
      400,
    );
    expect(sawDigger).toBeGreaterThan(0);
    expect(world.view().buildings[0]?.state).toBe("plan");

    const n = tickUntil(world, () => flattenReady(world.grid, tiles, hut.flattenHeight));
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(12_000);
    tickUntil(world, () => world.view().buildings[0]?.state === "building", 500);
    expect(world.view().buildings[0]?.state).toBe("building");
    expect(world.view().movables.some((m) => m.type === "digger")).toBe(false);
  });

  it("holds a sloped tower in plan until diggers level it", () => {
    const grid = grass(48, 48);
    const at = { x: 20, y: 20 };
    slope(grid, at, towerDef.protected);
    const world = new World(grid);
    expect(world.plotLevel("tower", at)).toBe(false);
    expect(world.canPlaceBuilding("tower", at, 0)).toBe(true);
    const hut = world.placePlan("tower", at, 0)!;
    const tiles = footprint(towerDef.protected, at);
    expect(hut.flattenHeight).toBe(averageHeight(grid, tiles));

    for (const slot of towerDef.constructionStacks) {
      world.objects.place(goodsStack({ x: at.x + slot.dx, y: at.y + slot.dy }, slot.material, slot.required ?? 1));
    }
    for (let i = 0; i < 6; i++) world.spawnBearer({ x: at.x + 8, y: at.y + i }, 0);

    const sawDigger = tickUntil(
      world,
      () => world.view().movables.some((m) => m.type === "digger" || m.job === "flatten"),
      400,
    );
    expect(sawDigger).toBeGreaterThan(0);
    expect(world.view().buildings[0]?.state).toBe("plan");

    const n = tickUntil(world, () => flattenReady(world.grid, tiles, hut.flattenHeight));
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(12_000);
    tickUntil(world, () => world.view().buildings[0]?.state === "building", 500);
    expect(world.view().buildings[0]?.state).toBe("building");
    expect(world.view().movables.some((m) => m.type === "digger")).toBe(false);
  });

  it("construction mark is 0 on level ground and rises on a slope", () => {
    const grid = grass(48, 48);
    const at = { x: 20, y: 20 };
    const tiles = footprint(hutDef.protected, at);
    expect(constructionMarkValue(grid, tiles)).toBe(0);
    expect(constructionMarkFrame(0, 8)).toBe(0);
    expect(constructionMarkFrame(127, 8)).toBe(7);
    slope(grid, at, hutDef.protected);
    const v = constructionMarkValue(grid, tiles);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThanOrEqual(127);
    const world = new World(grid);
    expect(world.constructionMark("lumberjack", at, 0)).toBe(v);
    expect(world.constructionMark("tower", at, 0)).not.toBeNull();
  });
});
