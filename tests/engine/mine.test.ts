/** Iron / gold mines: no flatten, miner + pick, pull ore from blocked tiles. */
import { describe, expect, it } from "vitest";
import { ironmine as ironDef } from "../../src/sim/data/buildings/ironmine";
import { goldmine as goldDef } from "../../src/sim/data/buildings/goldmine";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { goodsStack } from "../../src/sim/object/object";
import { needsFlatten } from "../../src/sim/building/flatten";
import { World } from "../../src/sim/world/world";
import { seedRng } from "../../src/sim/rng/rng";

function mountain(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "mountain");
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

function fillBlocked(grid: MapGrid, at: { x: number; y: number }, blocked: readonly { dx: number; dy: number }[], kind: "iron" | "gold", amount: number): void {
  for (const t of blocked) grid.setResource(at.x + t.dx, at.y + t.dy, kind, amount);
}

describe("mines", () => {
  it("does not flatten", () => {
    expect(needsFlatten(ironDef)).toBe(false);
    expect(needsFlatten(goldDef)).toBe(false);
  });

  it("places on mountain and skips diggers on a slope", () => {
    const grid = mountain(40, 40);
    grid.setHeight(16, 16, 4);
    grid.setHeight(17, 17, 12);
    const world = new World(grid);
    const at = { x: 16, y: 16 };
    expect(world.canPlaceBuilding("ironmine", at, 0)).toBe(true);
    expect(world.plotLevel("ironmine", at)).toBe(true);
    expect(world.placePlan("ironmine", at, 0)?.state).toBe("plan");
  });

  it("pulls ironore onto the offer stack", () => {
    const at = { x: 16, y: 16 };
    const grid = mountain(48, 48);
    fillBlocked(grid, at, ironDef.blocked, "iron", 50);
    const world = new World(grid, undefined, seedRng(1));
    const hut = world.placeBuilding("ironmine", at, 0)!;
    const offer = { x: hut.pos.x + ironDef.offerStacks[0]!.dx, y: hut.pos.y + ironDef.offerStacks[0]!.dy };
    const n = tickUntil(world, () => world.objects.get(offer.x, offer.y)?.material === "ironore");
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(8000);
    expect(world.objects.get(offer.x, offer.y)).toMatchObject({ kind: "stack", material: "ironore" });
    expect(world.objects.get(offer.x, offer.y)!.capacity).toBeGreaterThanOrEqual(1);
    expect(world.view().movables.some((m) => m.type === "miner")).toBe(true);
  });

  it("pulls goldore from a gold mine", () => {
    const at = { x: 16, y: 16 };
    const grid = mountain(48, 48);
    fillBlocked(grid, at, goldDef.blocked, "gold", 50);
    const world = new World(grid, undefined, seedRng(2));
    const hut = world.placeBuilding("goldmine", at, 0)!;
    const offer = { x: hut.pos.x + goldDef.offerStacks[0]!.dx, y: hut.pos.y + goldDef.offerStacks[0]!.dy };
    const n = tickUntil(world, () => world.objects.get(offer.x, offer.y)?.material === "goldore");
    expect(n).toBeGreaterThan(0);
    expect(world.objects.get(offer.x, offer.y)).toMatchObject({ material: "goldore" });
  });

  it("stays idle when the footprint has no matching ore", () => {
    const grid = mountain(40, 40);
    const world = new World(grid, undefined, seedRng(3));
    world.placeBuilding("ironmine", { x: 16, y: 16 }, 0);
    for (let i = 0; i < 400; i++) world.tick();
    expect(world.objects.all().some((o) => o.kind === "stack" && o.material === "ironore")).toBe(false);
  });

  it("consumes a pick before occupying a constructed mine", () => {
    const at = { x: 16, y: 16 };
    const grid = mountain(48, 48);
    fillBlocked(grid, at, ironDef.blocked, "iron", 50);
    const world = new World(grid, undefined, seedRng(4));
    const hut = world.placePlan("ironmine", at, 0)!;
    hut.state = "built";
    world.spawnBearer({ x: 20, y: 20 }, 0);
    for (let i = 0; i < 200; i++) world.tick();
    expect(world.view().movables.some((m) => m.type === "miner")).toBe(false);

    world.objects.place(goodsStack({ x: 18, y: 18 }, "pick", 1));
    const n = tickUntil(world, () => world.view().movables.some((m) => m.type === "miner"));
    expect(n).toBeGreaterThan(0);
    expect(world.objects.get(18, 18)).toBeUndefined();
    expect(world.movable(world.view().movables.find((m) => m.type === "miner")!.id)?.workplaceId).toBe(hut.id);
  });

  it("strips geologist signs on the footprint", () => {
    const at = { x: 16, y: 16 };
    const grid = mountain(40, 40);
    const world = new World(grid);
    const tile = { x: at.x + ironDef.protected[0]!.dx, y: at.y + ironDef.protected[0]!.dy };
    world.objects.place({
      kind: "sign",
      x: tile.x,
      y: tile.y,
      sheet: 0,
      capacity: 999,
      stateProgress: 1,
      sign: "iron",
    });
    expect(world.placePlan("ironmine", at, 0)).toBeDefined();
    expect(world.objects.get(tile.x, tile.y)).toBeUndefined();
  });

  it("decrements the deposit it took", () => {
    const at = { x: 16, y: 16 };
    const grid = mountain(48, 48);
    fillBlocked(grid, at, ironDef.blocked, "iron", 2);
    const before = ironDef.blocked.reduce((n, t) => n + (grid.resourceAt(at.x + t.dx, at.y + t.dy)?.amount ?? 0), 0);
    const world = new World(grid, undefined, seedRng(5));
    const hut = world.placeBuilding("ironmine", at, 0)!;
    const offer = { x: hut.pos.x + ironDef.offerStacks[0]!.dx, y: hut.pos.y + ironDef.offerStacks[0]!.dy };
    tickUntil(world, () => (world.objects.get(offer.x, offer.y)?.capacity ?? 0) >= 1);
    const after = ironDef.blocked.reduce((n, t) => n + (world.grid.resourceAt(at.x + t.dx, at.y + t.dy)?.amount ?? 0), 0);
    expect(after).toBe(before - 1);
  });
});
