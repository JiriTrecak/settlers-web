import { describe, expect, it } from "vitest";
import { lumberjack as hutDef } from "../../src/sim/data/buildings/lumberjack";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { goodsStack } from "../../src/sim/object/object";
import { World } from "../../src/sim/world/world";

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

describe("construction", () => {
  it("hauls construction goods, finishes the plan, and converts a bearer", () => {
    const world = new World(grass(48, 48));
    const at = { x: 16, y: 16 };
    expect(world.placePlan("lumberjack", at, 0)).toMatchObject({ state: "plan" });
    expect(world.view().movables).toEqual([]);
    world.objects.place(goodsStack({ x: 24, y: 16 }, "plank", 2));
    world.objects.place(goodsStack({ x: 24, y: 18 }, "stone", 2));
    world.spawnBearer({ x: 22, y: 16 }, 0);

    const n = tickUntil(world, () => world.view().buildings[0]?.state === "built");
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(8000);
    const plankAt = { x: at.x + hutDef.constructionStacks[1]!.dx, y: at.y + hutDef.constructionStacks[1]!.dy };
    const stoneAt = { x: at.x + hutDef.constructionStacks[0]!.dx, y: at.y + hutDef.constructionStacks[0]!.dy };
    expect(world.objects.get(plankAt.x, plankAt.y)).toBeUndefined();
    expect(world.objects.get(stoneAt.x, stoneAt.y)).toBeUndefined();

    tickUntil(world, () => world.view().movables.some((m) => m.type === "lumberjack"), 2000);
    const worker = world.view().movables.find((m) => m.type === "lumberjack");
    expect(worker).toMatchObject({ workplaceId: 1, inside: true });
    expect(world.view().movables.some((m) => m.type === "bearer")).toBe(false);
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
});
