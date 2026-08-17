import { describe, expect, it } from "vitest";
import { hexDist, type GridPos } from "../../src/shared";
import { stonecutter as hutDef } from "../../src/sim/data/buildings/stonecutter";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { ObjectGrid, STACK_SIZE } from "../../src/sim/object/object";
import { cutStand } from "../../src/sim/object/stone";
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

function placeStone(objects: ObjectGrid, at: GridPos, capacity = 8): void {
  objects.place({ kind: "stone", x: at.x, y: at.y, sheet: 0, capacity, stateProgress: 1 });
}

/** Stone in work radius whose stand/own pair matches `wantStandOwned`. */
function borderRock(world: World, center: GridPos, wantStandOwned: boolean): GridPos {
  for (let y = 1; y < world.grid.height - 1; y++) {
    for (let x = 1; x < world.grid.width - 1; x++) {
      const stone = { x, y };
      const d = hexDist(center.x, center.y, x, y);
      if (d > hutDef.workRadius || d === 0) continue;
      const stand = cutStand(stone);
      if (!world.grid.inBounds(stand.x, stand.y)) continue;
      const standOwned = world.land.playerAt(stand.x, stand.y) === 0;
      const stoneOwned = world.land.playerAt(x, y) === 0;
      if (standOwned !== wantStandOwned) continue;
      if (wantStandOwned && stoneOwned) continue;
      if (!wantStandOwned && !stoneOwned) continue;
      return stone;
    }
  }
  throw new Error("no border rock");
}

describe("stonecutter", () => {
  it("spawns at the hut door", () => {
    const world = new World(grass(32, 32));
    const at = { x: 12, y: 12 };
    const hut = world.placeBuilding("stonecutter", at, 0);
    expect(hut).toBeDefined();
    const door = { x: at.x + hutDef.door.dx, y: at.y + hutDef.door.dy };
    expect(world.view().movables).toHaveLength(1);
    expect(world.view().movables[0]).toMatchObject({
      type: "stonecutter",
      pos: door,
      workplaceId: hut!.id,
      material: "none",
      inside: true,
    });
    expect(world.canStand(door.x, door.y)).toBe(true);
  });

  it("stays inside for restMs then walks out to cut", () => {
    const objects = new ObjectGrid(32, 32);
    placeStone(objects, { x: 20, y: 12 });
    const world = new World(grass(32, 32), objects);
    world.placeBuilding("stonecutter", { x: 12, y: 12 }, 0);
    expect(world.view().movables[0]!.inside).toBe(true);
    for (let i = 0; i < 119; i++) world.tick();
    expect(world.view().movables[0]!.inside).toBe(true);
    tickUntil(world, () => world.view().movables[0]?.inside === false, 20);
    expect(world.view().movables[0]!.inside).toBe(false);
    expect(world.view().movables[0]!.action).not.toBe("idle");
  });

  it("cuts a stone in radius and dumps it on the offer stack", () => {
    const objects = new ObjectGrid(32, 32);
    const stone = { x: 20, y: 12 };
    placeStone(objects, stone, 3);
    const world = new World(grass(32, 32), objects);
    const at = { x: 12, y: 12 };
    expect(hexDist(at.x, at.y, stone.x, stone.y)).toBeLessThanOrEqual(hutDef.workRadius);
    world.placeBuilding("stonecutter", at, 0);
    const offer = { x: at.x + hutDef.offerStacks[0]!.dx, y: at.y + hutDef.offerStacks[0]!.dy };

    const n = tickUntil(world, () => world.objects.get(offer.x, offer.y)?.kind === "stack", 5000);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(5000);
    expect(world.objects.get(stone.x, stone.y)).toMatchObject({ kind: "stone", capacity: 2 });
    expect(world.objects.get(offer.x, offer.y)).toMatchObject({
      kind: "stack",
      material: "stone",
      capacity: 1,
    });
    expect(world.view().movables[0]).toMatchObject({ type: "stonecutter", material: "none" });
  });

  it("removes the rock on the last cut", () => {
    const objects = new ObjectGrid(32, 32);
    const stone = { x: 20, y: 12 };
    placeStone(objects, stone, 1);
    const world = new World(grass(32, 32), objects);
    world.placeBuilding("stonecutter", { x: 12, y: 12 }, 0);
    tickUntil(world, () => world.objects.get(stone.x, stone.y)?.kind !== "stone", 5000);
    expect(world.objects.get(stone.x, stone.y)).toBeUndefined();
  });

  it("picks for the full chop window before the stone loses a cut", () => {
    const objects = new ObjectGrid(32, 32);
    placeStone(objects, { x: 20, y: 12 }, 8);
    const world = new World(grass(32, 32), objects);
    world.placeBuilding("stonecutter", { x: 12, y: 12 }, 0);
    tickUntil(world, () => world.view().movables[0]?.action === "work", 2000);
    const stand = cutStand({ x: 20, y: 12 });
    expect(world.view().movables[0]).toMatchObject({
      pos: stand,
      direction: "sw",
    });
    const started = world.view().tick;
    tickUntil(world, () => (world.objects.get(20, 12)?.capacity ?? 0) < 8, 400);
    expect(world.view().tick - started).toBeGreaterThanOrEqual(179);
  });

  it("stops cutting when the offer stack is full", () => {
    const objects = new ObjectGrid(32, 32);
    placeStone(objects, { x: 20, y: 12 }, 8);
    const world = new World(grass(32, 32), objects);
    const at = { x: 12, y: 12 };
    world.placeBuilding("stonecutter", at, 0);
    const offer = { x: at.x + hutDef.offerStacks[0]!.dx, y: at.y + hutDef.offerStacks[0]!.dy };

    tickUntil(world, () => world.objects.get(offer.x, offer.y)?.kind === "stack");
    const stack = world.objects.get(offer.x, offer.y)!;
    stack.capacity = STACK_SIZE;
    const left = world.objects.get(20, 12)!.capacity;

    for (let i = 0; i < 800; i++) world.tick();
    expect(world.objects.get(20, 12)?.capacity).toBe(left);
    expect(world.objects.get(offer.x, offer.y)?.capacity).toBe(STACK_SIZE);
    expect(world.view().movables[0]!.material).toBe("none");
  });

  it("does not send two stonecutters at the same rock", () => {
    const objects = new ObjectGrid(40, 40);
    const stone = { x: 20, y: 16 };
    placeStone(objects, stone, 8);
    const world = new World(grass(40, 40), objects);
    world.placeBuilding("stonecutter", { x: 12, y: 16 }, 0);
    world.placeBuilding("stonecutter", { x: 28, y: 16 }, 0);
    expect(hexDist(12, 16, stone.x, stone.y)).toBeLessThanOrEqual(hutDef.workRadius);
    expect(hexDist(28, 16, stone.x, stone.y)).toBeLessThanOrEqual(hutDef.workRadius);

    tickUntil(world, () => world.view().movables.some((m) => m.job === "cut"), 2000);
    const cutting = world.view().movables.filter((m) => m.job === "cut");
    expect(cutting).toHaveLength(1);
    const idle = world.view().movables.find((m) => m.job !== "cut");
    expect(idle?.inside).toBe(true);
    tickUntil(world, () => (world.objects.get(stone.x, stone.y)?.capacity ?? 8) < 8, 800);
    expect(world.view().movables.filter((m) => m.job === "cut")).toHaveLength(0);
  });

  it("cuts a stone off owned land when the stand is owned", () => {
    const objects = new ObjectGrid(40, 40);
    const world = new World(grass(40, 40), objects);
    world.land.occupy({ x: 12, y: 12 }, 0, 10);
    const stone = borderRock(world, { x: 12, y: 12 }, true);
    expect(world.land.playerAt(stone.x, stone.y)).toBe(UNOWNED);
    expect(world.land.playerAt(cutStand(stone).x, cutStand(stone).y)).toBe(0);
    placeStone(objects, stone, 1);
    world.placeBuilding("stonecutter", { x: 12, y: 12 }, 0);
    tickUntil(world, () => world.objects.get(stone.x, stone.y)?.kind !== "stone", 5000);
    expect(world.objects.get(stone.x, stone.y)).toBeUndefined();
  });

  it("does not cut when the stand is off owned land", () => {
    const objects = new ObjectGrid(40, 40);
    const world = new World(grass(40, 40), objects);
    world.land.occupy({ x: 12, y: 12 }, 0, 10);
    const stone = borderRock(world, { x: 12, y: 12 }, false);
    expect(world.land.playerAt(cutStand(stone).x, cutStand(stone).y)).toBe(UNOWNED);
    placeStone(objects, stone, 8);
    world.placeBuilding("stonecutter", { x: 12, y: 12 }, 0);
    for (let i = 0; i < 800; i++) world.tick();
    expect(world.objects.get(stone.x, stone.y)?.kind).toBe("stone");
    expect(world.view().movables[0]!.inside).toBe(true);
  });
});
