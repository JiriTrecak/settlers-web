import { describe, expect, it } from "vitest";
import { hexDist } from "../../src/shared";
import { lumberjack as hutDef } from "../../src/sim/data/buildings/lumberjack";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { ObjectGrid, STACK_SIZE } from "../../src/sim/object/object";
import { World } from "../../src/sim/world/world";
import { UNOWNED } from "../../src/sim/land/land";

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

function tickUntil(world: World, pred: () => boolean, cap = 4000): number {
  let n = 0;
  while (!pred() && n < cap) {
    world.tick();
    n++;
  }
  return n;
}

describe("lumberjack", () => {
  it("spawns at the hut door", () => {
    const world = new World(grass(32, 32));
    const at = { x: 12, y: 12 };
    const hut = world.placeBuilding("lumberjack", at, 0);
    expect(hut).toBeDefined();
    const door = { x: at.x + hutDef.door.dx, y: at.y + hutDef.door.dy };
    expect(world.view().movables).toHaveLength(1);
    expect(world.view().movables[0]).toMatchObject({
      type: "lumberjack",
      pos: door,
      workplaceId: hut!.id,
      material: "none",
      inside: true,
    });
    expect(world.canStand(door.x, door.y)).toBe(true);
  });

  it("stays inside for restMs then walks out to chop", () => {
    const objects = new ObjectGrid(32, 32);
    objects.place({ kind: "tree", x: 20, y: 12, sheet: 0, capacity: 0, stateProgress: 1 });
    const world = new World(grass(32, 32), objects);
    world.placeBuilding("lumberjack", { x: 12, y: 12 }, 0);
    expect(world.view().movables[0]!.inside).toBe(true);
    for (let i = 0; i < 119; i++) world.tick();
    expect(world.view().movables[0]!.inside).toBe(true);
    tickUntil(world, () => world.view().movables[0]?.inside === false, 20);
    expect(world.view().movables[0]!.inside).toBe(false);
    expect(world.view().movables[0]!.action).not.toBe("idle");
  });

  it("chops a tree in radius and dumps the trunk on the offer stack", () => {
    const objects = new ObjectGrid(32, 32);
    const tree = { x: 20, y: 12 };
    objects.place({ kind: "tree", x: tree.x, y: tree.y, sheet: 0, capacity: 0, stateProgress: 1 });
    const world = new World(grass(32, 32), objects);
    const at = { x: 12, y: 12 };
    expect(hexDist(at.x, at.y, tree.x, tree.y)).toBeLessThanOrEqual(hutDef.workRadius);
    world.placeBuilding("lumberjack", at, 0);
    const offer = { x: at.x + hutDef.offerStacks[0]!.dx, y: at.y + hutDef.offerStacks[0]!.dy };

    const n = tickUntil(world, () => world.objects.get(offer.x, offer.y)?.kind === "stack", 5000);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(5000);
    expect(world.objects.get(tree.x, tree.y)).toBeUndefined();
    expect(world.objects.get(offer.x, offer.y)).toMatchObject({
      kind: "stack",
      material: "trunk",
      capacity: 1,
    });
    expect(world.view().movables[0]).toMatchObject({ type: "lumberjack", material: "none" });
  });

  it("axes for the full chop window before the tree is gone", () => {
    const objects = new ObjectGrid(32, 32);
    objects.place({ kind: "tree", x: 20, y: 12, sheet: 0, capacity: 0, stateProgress: 1 });
    const world = new World(grass(32, 32), objects);
    world.placeBuilding("lumberjack", { x: 12, y: 12 }, 0);
    tickUntil(world, () => world.view().movables[0]?.action === "work", 2000);
    expect(world.view().movables[0]).toMatchObject({
      pos: { x: 21, y: 13 },
      direction: "nw",
    });
    const started = world.view().tick;
    tickUntil(world, () => world.objects.get(20, 12)?.kind !== "tree", 400);
    expect(world.view().tick - started).toBeGreaterThanOrEqual(200);
  });

  it("plays the fall clip for fallMs before the tree is removed", () => {
    const objects = new ObjectGrid(32, 32);
    objects.place({ kind: "tree", x: 20, y: 12, sheet: 0, capacity: 0, stateProgress: 1 });
    const world = new World(grass(32, 32), objects);
    world.placeBuilding("lumberjack", { x: 12, y: 12 }, 0);
    tickUntil(world, () => world.view().movables[0]?.action === "work", 2000);
    tickUntil(world, () => (world.objects.get(20, 12)?.stateProgress ?? 1) < 1, 400);
    const fallStart = world.view().tick;
    tickUntil(world, () => world.objects.get(20, 12)?.kind !== "tree", 200);
    expect(world.view().tick - fallStart).toBeGreaterThanOrEqual(50);
  });

  it("stops chopping when the offer stack is full", () => {
    const objects = new ObjectGrid(32, 32);
    objects.place({ kind: "tree", x: 20, y: 12, sheet: 0, capacity: 0, stateProgress: 1 });
    const world = new World(grass(32, 32), objects);
    const at = { x: 12, y: 12 };
    world.placeBuilding("lumberjack", at, 0);
    const offer = { x: at.x + hutDef.offerStacks[0]!.dx, y: at.y + hutDef.offerStacks[0]!.dy };

    tickUntil(world, () => world.objects.get(offer.x, offer.y)?.kind === "stack");
    const stack = world.objects.get(offer.x, offer.y)!;
    stack.capacity = STACK_SIZE;
    objects.place({ kind: "tree", x: 21, y: 12, sheet: 0, capacity: 0, stateProgress: 1 });

    for (let i = 0; i < 800; i++) world.tick();
    expect(world.objects.get(21, 12)?.kind).toBe("tree");
    expect(world.objects.get(offer.x, offer.y)?.capacity).toBe(STACK_SIZE);
    expect(world.view().movables[0]!.material).toBe("none");
  });

  it("does not send two lumberjacks at the same tree", () => {
    const objects = new ObjectGrid(40, 40);
    const tree = { x: 20, y: 16 };
    objects.place({ kind: "tree", x: tree.x, y: tree.y, sheet: 0, capacity: 0, stateProgress: 1 });
    const world = new World(grass(40, 40), objects);
    world.placeBuilding("lumberjack", { x: 12, y: 16 }, 0);
    world.placeBuilding("lumberjack", { x: 28, y: 16 }, 0);
    expect(hexDist(12, 16, tree.x, tree.y)).toBeLessThanOrEqual(hutDef.workRadius);
    expect(hexDist(28, 16, tree.x, tree.y)).toBeLessThanOrEqual(hutDef.workRadius);

    tickUntil(world, () => world.view().movables.some((m) => m.job === "chop"), 2000);
    const chopping = world.view().movables.filter((m) => m.job === "chop");
    expect(chopping).toHaveLength(1);
    const idle = world.view().movables.find((m) => m.job !== "chop");
    expect(idle?.inside).toBe(true);
    tickUntil(world, () => world.objects.get(tree.x, tree.y)?.kind !== "tree", 800);
    expect(world.view().movables.filter((m) => m.job === "chop")).toHaveLength(0);
  });

  it("does not chop a tree off owned land", () => {
    const objects = new ObjectGrid(40, 40);
    objects.place({ kind: "tree", x: 28, y: 12, sheet: 0, capacity: 0, stateProgress: 1 });
    const world = new World(grass(40, 40), objects);
    world.land.occupy({ x: 12, y: 12 }, 0, 10);
    expect(hexDist(12, 12, 28, 12)).toBeLessThanOrEqual(hutDef.workRadius);
    expect(world.land.playerAt(28, 12)).toBe(UNOWNED);
    world.placeBuilding("lumberjack", { x: 12, y: 12 }, 0);
    for (let i = 0; i < 800; i++) world.tick();
    expect(world.objects.get(28, 12)?.kind).toBe("tree");
    expect(world.view().movables[0]!.inside).toBe(true);
  });
});
