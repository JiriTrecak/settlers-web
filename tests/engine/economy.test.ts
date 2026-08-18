import { describe, expect, it } from "vitest";
import { hexDist } from "../../src/shared";
import { lumberjack as hutDef } from "../../src/sim/data/buildings/lumberjack";
import { sawmill as millDef } from "../../src/sim/data/buildings/sawmill";
import { small_livinghouse as houseDef } from "../../src/sim/data/buildings/small_livinghouse";
import { placeColony } from "../../src/sim/economy/startKit";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { goodsStack, STACK_SIZE } from "../../src/sim/object/object";
import { World } from "../../src/sim/world/world";

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

function tickUntil(world: World, pred: () => boolean, cap = 6000): number {
  let n = 0;
  while (!pred() && n < cap) {
    world.tick();
    n++;
  }
  return n;
}

describe("colony", () => {
  it("stamps tower, house, goods, and jobless bearers", () => {
    const world = new World(grass(64, 64));
    placeColony(world, { x: 32, y: 32 }, 0);
    const kinds = world.view().buildings.map((b) => b.kind).sort();
    expect(kinds).toContain("tower");
    expect(kinds).toContain("small_livinghouse");
    const bearers = world.view().movables.filter((m) => m.type === "bearer");
    expect(bearers.length).toBeGreaterThanOrEqual(16);
    const stacks = world.view().objects.filter((o) => o.kind === "stack");
    expect(stacks.some((s) => s.material === "plank")).toBe(true);
    expect(stacks.some((s) => s.material === "stone")).toBe(true);
    expect(stacks.some((s) => s.material === "axe")).toBe(true);
    expect(world.land.playerAt(32, 32)).toBe(0);
    expect(world.land.hasLand()).toBe(true);
    expect(world.view(0).fog.sightAt(32, 32)).toBe(100);
  });
});

describe("matcher", () => {
  it("hauls a trunk from a lumberjack offer to a sawmill request", () => {
    const world = new World(grass(48, 48));
    const hutAt = { x: 10, y: 10 };
    const millAt = { x: 28, y: 12 };
    expect(world.placeBuilding("lumberjack", hutAt, 0)).toBeDefined();
    expect(world.placeBuilding("sawmill", millAt, 0)).toBeDefined();
    const offer = { x: hutAt.x + hutDef.offerStacks[0]!.dx, y: hutAt.y + hutDef.offerStacks[0]!.dy };
    const request = { x: millAt.x + millDef.requestStacks[0]!.dx, y: millAt.y + millDef.requestStacks[0]!.dy };
    world.objects.place(goodsStack(offer, "trunk", 1));
    world.spawnBearer({ x: offer.x + 2, y: offer.y }, 0);

    const n = tickUntil(world, () => (world.objects.get(request.x, request.y)?.capacity ?? 0) >= 1);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(6000);
    expect(world.objects.get(offer.x, offer.y)).toBeUndefined();
    expect(world.objects.get(request.x, request.y)).toMatchObject({ kind: "stack", material: "trunk", capacity: 1 });
  });

  it("stops hauling when the request stack is full", () => {
    const world = new World(grass(48, 48));
    const hutAt = { x: 10, y: 10 };
    const millAt = { x: 28, y: 12 };
    world.placeBuilding("lumberjack", hutAt, 0);
    world.placeBuilding("sawmill", millAt, 0);
    const offer = { x: hutAt.x + hutDef.offerStacks[0]!.dx, y: hutAt.y + hutDef.offerStacks[0]!.dy };
    const request = { x: millAt.x + millDef.requestStacks[0]!.dx, y: millAt.y + millDef.requestStacks[0]!.dy };
    const millOffer = { x: millAt.x + millDef.offerStacks[0]!.dx, y: millAt.y + millDef.offerStacks[0]!.dy };
    world.objects.place(goodsStack(offer, "trunk", 3));
    world.objects.place(goodsStack(request, "trunk", STACK_SIZE));
    world.objects.place(goodsStack(millOffer, "plank", STACK_SIZE));
    world.spawnBearer({ x: offer.x + 2, y: offer.y }, 0);
    for (let i = 0; i < 400; i++) world.tick();
    expect(world.objects.get(offer.x, offer.y)?.capacity).toBe(3);
    expect(world.objects.get(request.x, request.y)?.capacity).toBe(STACK_SIZE);
  });

  it("does not haul another player's trunks", () => {
    const world = new World(grass(48, 48));
    const p0Hut = { x: 10, y: 10 };
    const p1Hut = { x: 10, y: 28 };
    const millAt = { x: 28, y: 12 };
    expect(world.placeBuilding("lumberjack", p0Hut, 0)).toBeDefined();
    expect(world.placeBuilding("lumberjack", p1Hut, 1)).toBeDefined();
    expect(world.placeBuilding("sawmill", millAt, 0)).toBeDefined();
    const p0Offer = { x: p0Hut.x + hutDef.offerStacks[0]!.dx, y: p0Hut.y + hutDef.offerStacks[0]!.dy };
    const p1Offer = { x: p1Hut.x + hutDef.offerStacks[0]!.dx, y: p1Hut.y + hutDef.offerStacks[0]!.dy };
    const request = { x: millAt.x + millDef.requestStacks[0]!.dx, y: millAt.y + millDef.requestStacks[0]!.dy };
    world.objects.place(goodsStack(p0Offer, "trunk", 1));
    world.objects.place(goodsStack(p1Offer, "trunk", 1));
    world.spawnBearer({ x: p0Offer.x + 2, y: p0Offer.y }, 0);
    world.spawnBearer({ x: millAt.x, y: millAt.y + 1 }, 1);

    const n = tickUntil(world, () => (world.objects.get(request.x, request.y)?.capacity ?? 0) >= 1);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(6000);
    expect(world.objects.get(request.x, request.y)).toMatchObject({ kind: "stack", material: "trunk", capacity: 1 });
    expect(world.objects.get(p0Offer.x, p0Offer.y)).toBeUndefined();
    expect(world.objects.get(p1Offer.x, p1Offer.y)).toMatchObject({ kind: "stack", material: "trunk", capacity: 1 });
    expect(world.view().movables.filter((m) => m.player === 1 && m.job === "deliver")).toEqual([]);
  });
});

describe("house", () => {
  it("spawns bearers up to its bed count", () => {
    const world = new World(grass(40, 40));
    expect(world.placeBuilding("small_livinghouse", { x: 16, y: 16 }, 0)).toBeDefined();
    expect(world.view().movables).toEqual([]);
    const n = tickUntil(world, () => world.view().movables.filter((m) => m.type === "bearer").length >= 10, 3000);
    expect(n).toBeGreaterThan(0);
    expect(world.view().movables.filter((m) => m.type === "bearer")).toHaveLength(10);
    for (let i = 0; i < 200; i++) world.tick();
    expect(world.view().movables.filter((m) => m.type === "bearer")).toHaveLength(10);
  });

  it("jobless bearers flock away from the door", () => {
    const world = new World(grass(40, 40));
    const at = { x: 16, y: 16 };
    expect(world.placeBuilding("small_livinghouse", at, 0)).toBeDefined();
    tickUntil(world, () => world.view().movables.filter((m) => m.type === "bearer").length >= 10, 3000);
    for (let i = 0; i < 400; i++) world.tick();
    const door = { x: at.x + houseDef.door.dx, y: at.y + houseDef.door.dy };
    const bearers = world.view().movables.filter((m) => m.type === "bearer");
    expect(bearers).toHaveLength(10);
    const tiles = new Set(bearers.map((m) => `${m.pos.x},${m.pos.y}`));
    expect(tiles.size).toBe(10);
    const huddled = bearers.filter((m) => hexDist(m.pos.x, m.pos.y, door.x, door.y) <= 1);
    expect(huddled.length).toBeLessThan(10);
  });
});
