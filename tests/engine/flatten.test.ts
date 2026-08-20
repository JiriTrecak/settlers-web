/** Flatten: any hut on a slope waits for diggers; level grass still constructs as today. */
import { describe, expect, it } from "vitest";
import { lumberjack as hutDef } from "../../src/sim/data/buildings/lumberjack";
import { tower as towerDef } from "../../src/sim/data/buildings/tower";
import { averageHeight, constructionMarkFrame, constructionMarkValue, flattenReady, footprint } from "../../src/sim/building/flatten";
import { placeColony } from "../../src/sim/economy/startKit";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { goodsStack } from "../../src/sim/object/object";
import { DEFAULT_DIGGER_RATIO } from "../../src/sim/profession/limit";
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

function placeBlades(world: World, at: { x: number; y: number }, n = 5): void {
  world.objects.place(goodsStack({ x: at.x + 7, y: at.y }, "blade", n));
}

function diggersOf(world: World, player = 0): number {
  return world.view().movables.filter((m) => m.player === player && m.type === "digger").length;
}

function sawDiggerWork(world: World): boolean {
  return world.view().movables.some((m) => m.type === "digger" || m.job === "flatten" || m.job === "equip");
}

function flattening(world: World, hutId: number): number {
  return world.view().movables.filter((m) => m.type === "digger" && m.job === "flatten" && m.workplaceId === hutId)
    .length;
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
    placeBlades(world, at);
    for (let i = 0; i < 6; i++) world.spawnBearer({ x: at.x + 8, y: at.y + i }, 0);

    const saw = tickUntil(world, () => sawDiggerWork(world), 800);
    expect(saw).toBeGreaterThan(0);
    expect(world.view().buildings[0]?.state).toBe("plan");

    const n = tickUntil(world, () => flattenReady(world.grid, tiles, hut.flattenHeight));
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(12_000);
    tickUntil(world, () => world.view().buildings[0]?.state === "building", 500);
    expect(world.view().buildings[0]?.state).toBe("building");
    expect(diggersOf(world)).toBeGreaterThan(0);
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
    placeBlades(world, at);
    for (let i = 0; i < 6; i++) world.spawnBearer({ x: at.x + 8, y: at.y + i }, 0);

    const saw = tickUntil(world, () => sawDiggerWork(world), 800);
    expect(saw).toBeGreaterThan(0);
    expect(world.view().buildings[0]?.state).toBe("plan");

    const n = tickUntil(world, () => flattenReady(world.grid, tiles, hut.flattenHeight));
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(12_000);
    tickUntil(world, () => world.view().buildings[0]?.state === "building", 500);
    expect(world.view().buildings[0]?.state).toBe("building");
    expect(diggersOf(world)).toBeGreaterThan(0);
  });

  it("does not recruit diggers when there are no blades", () => {
    const grid = grass(48, 48);
    const at = { x: 20, y: 20 };
    slope(grid, at, hutDef.protected);
    const world = new World(grid);
    world.placePlan("lumberjack", at, 0);
    for (const slot of hutDef.constructionStacks) {
      world.objects.place(goodsStack({ x: at.x + slot.dx, y: at.y + slot.dy }, slot.material, slot.required ?? 1));
    }
    for (let i = 0; i < 6; i++) world.spawnBearer({ x: at.x + 8, y: at.y + i }, 0);
    tickUntil(world, () => sawDiggerWork(world), 400);
    expect(sawDiggerWork(world)).toBe(false);
    expect(world.view().buildings[0]?.state).toBe("plan");
  });

  it("caps diggers at 25% of civilians even with extra blades", () => {
    const grid = grass(48, 48);
    const at = { x: 16, y: 16 };
    slope(grid, at, hutDef.protected);
    const world = new World(grid);
    expect(world.diggerRatio(0)).toBe(DEFAULT_DIGGER_RATIO);
    world.placePlan("lumberjack", at, 0);
    for (const slot of hutDef.constructionStacks) {
      world.objects.place(goodsStack({ x: at.x + slot.dx, y: at.y + slot.dy }, slot.material, slot.required ?? 1));
    }
    placeBlades(world, at, 5);
    for (let i = 0; i < 16; i++) world.spawnBearer({ x: at.x + 10, y: at.y + i }, 0);

    tickUntil(world, () => diggersOf(world) >= 4, 2000);
    expect(diggersOf(world)).toBe(4);
    for (let i = 0; i < 400; i++) world.tick();
    expect(diggersOf(world)).toBe(4);
    const blades = world
      .view()
      .objects.filter((o) => o.kind === "stack" && o.material === "blade")
      .reduce((n, o) => n + o.capacity, 0);
    expect(blades).toBe(1);
  });

  it("fills the digger pool with no flatten hut", () => {
    const world = new World(grass(48, 48));
    placeBlades(world, { x: 16, y: 16 }, 5);
    for (let i = 0; i < 16; i++) world.spawnBearer({ x: 24, y: 8 + i }, 0);
    tickUntil(world, () => diggersOf(world) >= 4, 2000);
    expect(diggersOf(world)).toBe(4);
  });

  it("raising the cap recruits one more digger when a blade remains", () => {
    const world = new World(grass(48, 48));
    placeBlades(world, { x: 16, y: 16 }, 5);
    for (let i = 0; i < 16; i++) world.spawnBearer({ x: 24, y: 8 + i }, 0);
    tickUntil(world, () => diggersOf(world) >= 4, 2000);
    world.dispatch({ type: "setDiggerRatio", ratio: 5 / 16, player: 0 });
    tickUntil(world, () => diggersOf(world) >= 5, 2000);
    expect(diggersOf(world)).toBe(5);
  });

  it("drops blades from idle diggers when the ratio is lowered", () => {
    const grid = grass(48, 48);
    const at = { x: 16, y: 16 };
    slope(grid, at, hutDef.protected);
    const world = new World(grid);
    world.placePlan("lumberjack", at, 0);
    for (const slot of hutDef.constructionStacks) {
      world.objects.place(goodsStack({ x: at.x + slot.dx, y: at.y + slot.dy }, slot.material, slot.required ?? 1));
    }
    placeBlades(world, at, 5);
    for (let i = 0; i < 16; i++) world.spawnBearer({ x: at.x + 10, y: at.y + i }, 0);
    tickUntil(world, () => diggersOf(world) >= 4, 2000);
    expect(diggersOf(world)).toBe(4);

    world.dispatch({ type: "setDiggerRatio", ratio: 0, player: 0 });
    const n = tickUntil(world, () => diggersOf(world) === 0);
    expect(n).toBeGreaterThan(0);
    expect(diggersOf(world)).toBe(0);
    const blades = world
      .view()
      .objects.filter((o) => o.kind === "stack" && o.material === "blade")
      .reduce((n, o) => n + o.capacity, 0);
    expect(blades).toBe(5);
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

  it("fills the first sloped plan before the next queued one", () => {
    const grid = grass(64, 64);
    const a = { x: 16, y: 16 };
    const b = { x: 40, y: 40 };
    slope(grid, a, hutDef.protected);
    slope(grid, b, hutDef.protected);
    const world = new World(grid);
    const hutA = world.placePlan("lumberjack", a, 0)!;
    const hutB = world.placePlan("lumberjack", b, 0)!;
    for (const at of [a, b]) {
      for (const slot of hutDef.constructionStacks) {
        world.objects.place(goodsStack({ x: at.x + slot.dx, y: at.y + slot.dy }, slot.material, slot.required ?? 1));
      }
    }
    placeBlades(world, a, 5);
    for (let i = 0; i < 16; i++) world.spawnBearer({ x: 28, y: 8 + i }, 0);

    tickUntil(world, () => flattening(world, hutA.id) >= 3, 3000);
    expect(flattening(world, hutA.id)).toBeGreaterThanOrEqual(3);
    expect(flattening(world, hutB.id)).toBe(0);
    expect(flattenReady(world.grid, footprint(hutDef.protected, a), hutA.flattenHeight)).toBe(false);

    const tilesA = footprint(hutDef.protected, a);
    const tilesB = footprint(hutDef.protected, b);
    const nA = tickUntil(world, () => flattenReady(world.grid, tilesA, hutA.flattenHeight));
    expect(nA).toBeLessThan(12_000);
    tickUntil(world, () => flattening(world, hutB.id) >= 1, 2000);
    expect(flattening(world, hutB.id)).toBeGreaterThan(0);
    const nB = tickUntil(world, () => flattenReady(world.grid, tilesB, hutB.flattenHeight));
    expect(nB).toBeLessThan(12_000);
    tickUntil(world, () => world.view().buildings.every((h) => h.state === "building"), 500);
    expect(world.view().buildings.every((h) => h.state === "building")).toBe(true);
  });

  it("a later-queued sloped plan waits until the first plot is flat", () => {
    const grid = grass(64, 64);
    const a = { x: 16, y: 16 };
    const b = { x: 40, y: 40 };
    slope(grid, a, hutDef.protected);
    slope(grid, b, hutDef.protected);
    const world = new World(grid);
    const hutA = world.placePlan("lumberjack", a, 0)!;
    for (const slot of hutDef.constructionStacks) {
      world.objects.place(goodsStack({ x: a.x + slot.dx, y: a.y + slot.dy }, slot.material, slot.required ?? 1));
    }
    placeBlades(world, a, 5);
    for (let i = 0; i < 16; i++) world.spawnBearer({ x: 28, y: 8 + i }, 0);

    tickUntil(world, () => flattening(world, hutA.id) >= 3, 3000);
    expect(flattening(world, hutA.id)).toBeGreaterThanOrEqual(3);

    const hutB = world.placePlan("lumberjack", b, 0)!;
    for (const slot of hutDef.constructionStacks) {
      world.objects.place(goodsStack({ x: b.x + slot.dx, y: b.y + slot.dy }, slot.material, slot.required ?? 1));
    }

    const tilesA = footprint(hutDef.protected, a);
    for (let i = 0; i < 400; i++) {
      if (flattenReady(world.grid, tilesA, hutA.flattenHeight)) break;
      expect(flattening(world, hutB.id)).toBe(0);
      world.tick();
    }
    tickUntil(world, () => flattenReady(world.grid, tilesA, hutA.flattenHeight));
    tickUntil(world, () => flattening(world, hutB.id) >= 1, 2000);
    expect(flattening(world, hutB.id)).toBeGreaterThan(0);
  });

  it("lists every owned placeable origin after a colony stamps land", () => {
    const world = new World(grass(64, 64));
    expect(world.constructionMarks("lumberjack", 0)).toBeNull();
    placeColony(world, { x: 32, y: 32 }, 0);
    const marks = world.constructionMarks("lumberjack", 0);
    expect(marks).not.toBeNull();
    expect(marks!.length).toBeGreaterThan(0);
    for (const m of marks!) {
      expect(world.land.playerAt(m.x, m.y)).toBe(0);
      expect(world.constructionMark("lumberjack", { x: m.x, y: m.y }, 0)).toBe(m.value);
    }
  });
});
