import { describe, expect, it } from "vitest";
import { lumberjack as hutDef } from "../../src/sim/data/buildings/lumberjack";
import { BRICKLAYER_ACTIONS_PER_MATERIAL } from "../../src/sim/economy/construction";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { goodsStack } from "../../src/sim/object/object";
import { World } from "../../src/sim/world/world";

const MATERIALS = hutDef.constructionStacks.reduce((n, s) => n + (s.required ?? 1), 0);
const STEP = 1 / (BRICKLAYER_ACTIONS_PER_MATERIAL * MATERIALS);

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

function tickUntil(world: World, pred: () => boolean, cap = 8000): number {
  let n = 0;
  while (!pred() && n < cap) {
    world.tick();
    n++;
  }
  return n;
}

function hammersOf(world: World): number {
  return world
    .view()
    .objects.filter((o) => o.kind === "stack" && o.material === "hammer")
    .reduce((n, o) => n + o.capacity, 0);
}

function placeHammers(world: World, at: { x: number; y: number }, n = 2): void {
  world.objects.place(goodsStack({ x: at.x + 8, y: at.y + 4 }, "hammer", n));
}

describe("construction", () => {
  it("hauls goods, bricklayers hammer, then a bearer occupies", () => {
    const world = new World(grass(48, 48));
    const at = { x: 16, y: 16 };
    expect(world.placePlan("lumberjack", at, 0)).toMatchObject({ state: "plan" });
    expect(world.view().movables).toEqual([]);
    world.objects.place(goodsStack({ x: 24, y: 16 }, "plank", 2));
    world.objects.place(goodsStack({ x: 24, y: 18 }, "stone", 2));
    placeHammers(world, at, 1);
    world.spawnBearer({ x: 22, y: 16 }, 0);
    world.spawnBearer({ x: 22, y: 18 }, 0);
    world.spawnBearer({ x: 22, y: 20 }, 0);
    world.spawnBearer({ x: 21, y: 16 }, 0);

    const plankAt = { x: at.x + hutDef.constructionStacks[1]!.dx, y: at.y + hutDef.constructionStacks[1]!.dy };
    const stoneAt = { x: at.x + hutDef.constructionStacks[0]!.dx, y: at.y + hutDef.constructionStacks[0]!.dy };

    const toBuilding = tickUntil(world, () => world.view().buildings[0]?.state === "building");
    expect(toBuilding).toBeGreaterThan(0);
    expect(world.view().buildings[0]!.flag).toBeNull();
    expect(world.objects.get(plankAt.x, plankAt.y)).toBeDefined();
    expect(world.objects.get(stoneAt.x, stoneAt.y)).toBeDefined();

    tickUntil(
      world,
      () => world.view().movables.some((m) => m.type === "bricklayer" && m.action === "work"),
      2000,
    );
    const p0 = world.view().buildings[0]!.buildProgress;
    expect(p0).toBeCloseTo(STEP, 5);
    for (let i = 0; i < 20; i++) world.tick();
    expect(world.view().buildings[0]!.buildProgress).toBeCloseTo(p0, 5);
    for (let i = 0; i < 25; i++) world.tick();
    expect(world.view().buildings[0]!.buildProgress).toBeCloseTo(p0 + STEP, 5);

    const toBuilt = tickUntil(world, () => world.view().buildings[0]?.state === "built");
    expect(toBuilt).toBeGreaterThan(0);
    expect(toBuilt).toBeLessThan(8000);
    expect(world.view().buildings[0]!.flag).toBeNull();
    expect(world.objects.get(plankAt.x, plankAt.y)).toBeUndefined();
    expect(world.objects.get(stoneAt.x, stoneAt.y)).toBeUndefined();

    tickUntil(world, () => world.view().movables.some((m) => m.type === "lumberjack"), 2000);
    const worker = world.view().movables.find((m) => m.type === "lumberjack");
    expect(worker).toMatchObject({ workplaceId: 1, inside: true });
    expect(world.view().buildings[0]!.flag).toBe("roof");
    expect(world.view().movables.some((m) => m.type === "lumberjack")).toBe(true);
    expect(world.view().movables.some((m) => m.type === "bricklayer")).toBe(true);
    expect(hammersOf(world)).toBe(0);
  });

  it("sends two bricklayers onto a hut", () => {
    const world = new World(grass(48, 48));
    const at = { x: 16, y: 16 };
    expect(world.placePlan("lumberjack", at, 0)).toBeDefined();
    world.objects.place(goodsStack({ x: 24, y: 16 }, "plank", 2));
    world.objects.place(goodsStack({ x: 24, y: 18 }, "stone", 2));
    placeHammers(world, at, 2);
    world.spawnBearer({ x: 22, y: 16 }, 0);
    world.spawnBearer({ x: 22, y: 18 }, 0);
    world.spawnBearer({ x: 22, y: 20 }, 0);
    world.spawnBearer({ x: 21, y: 16 }, 0);
    world.dispatch({ type: "setBricklayerRatio", ratio: 1, player: 0 });

    tickUntil(world, () => world.view().buildings[0]?.state === "building");
    tickUntil(
      world,
      () => world.view().movables.filter((m) => m.type === "bricklayer" && m.action === "work").length >= 2,
      4000,
    );
    const p = world.view().buildings[0]!.buildProgress;
    expect(p).toBeGreaterThanOrEqual(2 * STEP - 1e-9);
    for (let i = 0; i < 50; i++) world.tick();
    const later = world.view().buildings[0]!.buildProgress;
    expect(later).toBeGreaterThan(p + STEP);
    expect(later).toBeLessThanOrEqual(p + 3 * STEP + 1e-6);

    tickUntil(world, () => world.view().buildings[0]?.state === "built");
    expect(world.view().buildings[0]?.state).toBe("built");
    expect(world.view().movables.filter((m) => m.type === "bricklayer")).toHaveLength(2);
    expect(hammersOf(world)).toBe(0);
  });

  it("does not steal another plan's construction pile", () => {
    const world = new World(grass(48, 48));
    const a = { x: 12, y: 12 };
    const b = { x: 28, y: 12 };
    expect(world.placePlan("lumberjack", a, 0)).toBeDefined();
    expect(world.placePlan("lumberjack", b, 0)).toBeDefined();
    const aPlank = {
      x: a.x + hutDef.constructionStacks[1]!.dx,
      y: a.y + hutDef.constructionStacks[1]!.dy,
    };
    const bPlank = {
      x: b.x + hutDef.constructionStacks[1]!.dx,
      y: b.y + hutDef.constructionStacks[1]!.dy,
    };
    world.objects.place(goodsStack(aPlank, "plank", 2));
    world.spawnBearer({ x: 20, y: 12 }, 0);
    for (let i = 0; i < 400; i++) world.tick();
    expect(world.objects.get(aPlank.x, aPlank.y)).toMatchObject({ material: "plank", capacity: 2 });
    expect(world.objects.get(bPlank.x, bPlank.y)).toBeUndefined();
  });

  it("does not recruit another player's bearer", () => {
    const world = new World(grass(48, 48));
    const at = { x: 16, y: 16 };
    expect(world.placePlan("lumberjack", at, 0)).toBeDefined();
    for (const slot of hutDef.constructionStacks) {
      world.objects.place(goodsStack({ x: at.x + slot.dx, y: at.y + slot.dy }, slot.material, slot.required ?? 1));
    }
    const enemy = world.spawnBearer({ x: at.x + 2, y: at.y + 2 }, 1);
    world.spawnBearer({ x: 32, y: 32 }, 0);
    placeHammers(world, at, 1);
    world.dispatch({ type: "setBricklayerRatio", ratio: 1, player: 0 });
    const n = tickUntil(world, () => world.view().movables.some((m) => m.type === "bricklayer" || m.job === "build" || m.job === "equip"), 2000);
    expect(n).toBeGreaterThan(0);
    expect(world.view().movables.find((m) => m.id === enemy.id)).toMatchObject({ player: 1, type: "bearer" });
    expect(world.view().movables.filter((m) => m.player === 1 && (m.type === "bricklayer" || m.job === "build"))).toEqual([]);
    expect(world.view().movables.some((m) => m.player === 0 && (m.type === "bricklayer" || m.job === "build" || m.job === "equip"))).toBe(true);
  });

  it("fills the bricklayer pool with no scaffold", () => {
    const world = new World(grass(48, 48));
    world.objects.place(goodsStack({ x: 16, y: 16 }, "hammer", 6));
    for (let i = 0; i < 16; i++) world.spawnBearer({ x: 24, y: 8 + i }, 0);
    tickUntil(world, () => world.view().movables.filter((m) => m.type === "bricklayer").length >= 4, 2000);
    expect(world.view().movables.filter((m) => m.type === "bricklayer")).toHaveLength(4);
  });

  it("raising the cap recruits one more bricklayer when a hammer remains", () => {
    const world = new World(grass(48, 48));
    world.objects.place(goodsStack({ x: 16, y: 16 }, "hammer", 6));
    for (let i = 0; i < 16; i++) world.spawnBearer({ x: 24, y: 8 + i }, 0);
    tickUntil(world, () => world.view().movables.filter((m) => m.type === "bricklayer").length >= 4, 2000);
    world.dispatch({ type: "setBricklayerRatio", ratio: 5 / 16, player: 0 });
    tickUntil(world, () => world.view().movables.filter((m) => m.type === "bricklayer").length >= 5, 2000);
    expect(world.view().movables.filter((m) => m.type === "bricklayer")).toHaveLength(5);
  });

  it("does not recruit bricklayers when there are no hammers", () => {
    const world = new World(grass(48, 48));
    const at = { x: 16, y: 16 };
    expect(world.placePlan("lumberjack", at, 0)).toBeDefined();
    for (const slot of hutDef.constructionStacks) {
      world.objects.place(goodsStack({ x: at.x + slot.dx, y: at.y + slot.dy }, slot.material, slot.required ?? 1));
    }
    world.spawnBearer({ x: 22, y: 16 }, 0);
    world.dispatch({ type: "setBricklayerRatio", ratio: 1, player: 0 });
    tickUntil(world, () => world.view().buildings[0]?.state === "building", 2000);
    expect(world.view().buildings[0]?.state).toBe("building");
    for (let i = 0; i < 400; i++) world.tick();
    expect(world.view().movables.some((m) => m.type === "bricklayer" || m.job === "build" || m.job === "equip")).toBe(false);
    expect(world.view().buildings[0]?.state).toBe("building");
  });

  it("drops hammers from idle bricklayers when the ratio is lowered", () => {
    const world = new World(grass(48, 48));
    world.objects.place(goodsStack({ x: 16, y: 16 }, "hammer", 6));
    for (let i = 0; i < 16; i++) world.spawnBearer({ x: 24, y: 8 + i }, 0);
    tickUntil(world, () => world.view().movables.filter((m) => m.type === "bricklayer").length >= 4, 2000);
    expect(world.view().movables.filter((m) => m.type === "bricklayer")).toHaveLength(4);
    world.dispatch({ type: "setBricklayerRatio", ratio: 0, player: 0 });
    const n = tickUntil(world, () => world.view().movables.filter((m) => m.type === "bricklayer").length === 0);
    expect(n).toBeGreaterThan(0);
    expect(world.view().movables.filter((m) => m.type === "bricklayer")).toHaveLength(0);
    expect(hammersOf(world)).toBe(6);
  });
});
