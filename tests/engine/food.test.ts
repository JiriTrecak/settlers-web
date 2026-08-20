/** Food chain: farm, mill, bakery, fisher, pig farm, slaughterhouse, waterworks. */
import { describe, expect, it } from "vitest";
import { farm as farmDef } from "../../src/sim/data/buildings/farm";
import { mill as millDef } from "../../src/sim/data/buildings/mill";
import { baker as bakerDef } from "../../src/sim/data/buildings/baker";
import { fisher as fisherDef } from "../../src/sim/data/buildings/fisher";
import { pig_farm as pigDef } from "../../src/sim/data/buildings/pig_farm";
import { slaughterhouse as slaughterDef } from "../../src/sim/data/buildings/slaughterhouse";
import { waterworks as waterDef } from "../../src/sim/data/buildings/waterworks";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { goodsStack } from "../../src/sim/object/object";
import { isWalkable } from "../../src/sim/path/path";
import { World } from "../../src/sim/world/world";
import { seedRng } from "../../src/sim/rng/rng";

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

function offerOf(hut: { pos: { x: number; y: number } }, def: { offerStacks: readonly { dx: number; dy: number }[] }) {
  const s = def.offerStacks[0]!;
  return { x: hut.pos.x + s.dx, y: hut.pos.y + s.dy };
}

function requestOf(
  hut: { pos: { x: number; y: number } },
  def: { requestStacks: readonly { dx: number; dy: number; material: string }[] },
  material: string,
) {
  const s = def.requestStacks.find((r) => r.material === material)!;
  return { x: hut.pos.x + s.dx, y: hut.pos.y + s.dy };
}

describe("food", () => {
  it("farm work origin is the dumped workcenter", () => {
    const world = new World(grass(64, 64), undefined, seedRng(1));
    const at = { x: 20, y: 20 };
    const hut = world.placeBuilding("farm", at, 0)!;
    expect(hut.work).toEqual({ x: at.x + farmDef.workCenter!.dx, y: at.y + farmDef.workCenter!.dy });
    expect(world.view().movables.some((m) => m.type === "farmer")).toBe(true);
  });

  it("crops do not block walking", () => {
    const world = new World(grass(16, 16));
    world.objects.place({ kind: "crop", x: 4, y: 4, sheet: 0, capacity: 0, stateProgress: 0, growing: true });
    expect(world.objects.blocks(4, 4)).toBe(false);
    expect(isWalkable(world.grid, 4, 4, world.objects)).toBe(true);
  });

  it("farmer plants crop then harvests it onto the offer", () => {
    const world = new World(grass(64, 64), undefined, seedRng(1));
    const hut = world.placeBuilding("farm", { x: 20, y: 20 }, 0)!;
    const offer = offerOf(hut, farmDef);
    const planted = tickUntil(world, () => world.objects.all().some((o) => o.kind === "crop"));
    expect(planted).toBeGreaterThan(0);
    expect(planted).toBeLessThan(8000);
    const crop = world.objects.all().find((o) => o.kind === "crop")!;
    expect(crop).toMatchObject({ growing: true });
    crop.growing = false;
    crop.stateProgress = 1;
    const n = tickUntil(world, () => world.objects.get(offer.x, offer.y)?.material === "crop");
    expect(n).toBeGreaterThan(0);
    expect(world.objects.get(offer.x, offer.y)).toMatchObject({ kind: "stack", material: "crop" });
    expect(world.objects.get(crop.x, crop.y)).toBeUndefined();
  });

  it("mill turns crop into flour", () => {
    const world = new World(grass(48, 48), undefined, seedRng(1));
    const hut = world.placeBuilding("mill", { x: 16, y: 16 }, 0)!;
    const req = requestOf(hut, millDef, "crop");
    const offer = offerOf(hut, millDef);
    world.objects.place(goodsStack(req, "crop", 2));
    const n = tickUntil(world, () => world.objects.get(offer.x, offer.y)?.material === "flour");
    expect(n).toBeGreaterThan(0);
    expect(world.objects.get(offer.x, offer.y)).toMatchObject({ kind: "stack", material: "flour" });
    expect(world.view().movables.some((m) => m.type === "miller")).toBe(true);
  });

  it("bakery turns flour and water into bread", () => {
    const world = new World(grass(48, 48), undefined, seedRng(1));
    const hut = world.placeBuilding("baker", { x: 16, y: 16 }, 0)!;
    world.objects.place(goodsStack(requestOf(hut, bakerDef, "flour"), "flour", 2));
    world.objects.place(goodsStack(requestOf(hut, bakerDef, "water"), "water", 2));
    const offer = offerOf(hut, bakerDef);
    const n = tickUntil(world, () => world.objects.get(offer.x, offer.y)?.material === "bread");
    expect(n).toBeGreaterThan(0);
    expect(world.objects.get(offer.x, offer.y)).toMatchObject({ material: "bread" });
  });

  it("pig farm turns crop and water into a pig", () => {
    const world = new World(grass(48, 48), undefined, seedRng(1));
    const hut = world.placeBuilding("pig_farm", { x: 16, y: 16 }, 0)!;
    world.objects.place(goodsStack(requestOf(hut, pigDef, "crop"), "crop", 2));
    world.objects.place(goodsStack(requestOf(hut, pigDef, "water"), "water", 2));
    const offer = offerOf(hut, pigDef);
    const n = tickUntil(world, () => world.objects.get(offer.x, offer.y)?.material === "pig");
    expect(n).toBeGreaterThan(0);
    expect(world.objects.get(offer.x, offer.y)).toMatchObject({ material: "pig" });
  });

  it("slaughterhouse turns a pig into meat", () => {
    const world = new World(grass(48, 48), undefined, seedRng(1));
    const hut = world.placeBuilding("slaughterhouse", { x: 16, y: 16 }, 0)!;
    world.objects.place(goodsStack(requestOf(hut, slaughterDef, "pig"), "pig", 2));
    const offer = offerOf(hut, slaughterDef);
    const n = tickUntil(world, () => world.objects.get(offer.x, offer.y)?.material === "meat");
    expect(n).toBeGreaterThan(0);
    expect(world.objects.get(offer.x, offer.y)).toMatchObject({ material: "meat" });
  });

  it("fisherman pulls fish from nearby water", () => {
    const at = { x: 16, y: 16 };
    const grid = grass(48, 48);
    for (let x = 24; x <= 28; x++) {
      grid.setLandscape(x, 16, "water8");
      grid.setResource(x, 16, "fish", 20);
    }
    const world = new World(grid, undefined, seedRng(1));
    const hut = world.placeBuilding("fisher", at, 0)!;
    const offer = offerOf(hut, fisherDef);
    const before = [24, 25, 26, 27, 28].reduce((n, x) => n + (world.grid.resourceAt(x, 16)?.amount ?? 0), 0);
    const n = tickUntil(world, () => world.objects.get(offer.x, offer.y)?.material === "fish");
    expect(n).toBeGreaterThan(0);
    expect(world.objects.get(offer.x, offer.y)).toMatchObject({ material: "fish" });
    const after = [24, 25, 26, 27, 28].reduce((n, x) => n + (world.grid.resourceAt(x, 16)?.amount ?? 0), 0);
    expect(after).toBe(before - 1);
  });

  it("waterworker fills a bucket from nearby water", () => {
    const at = { x: 16, y: 16 };
    const grid = grass(48, 48);
    for (let x = 22; x <= 26; x++) grid.setLandscape(x, 16, "water8");
    const world = new World(grid, undefined, seedRng(1));
    const hut = world.placeBuilding("waterworks", at, 0)!;
    const offer = offerOf(hut, waterDef);
    const n = tickUntil(world, () => world.objects.get(offer.x, offer.y)?.material === "water");
    expect(n).toBeGreaterThan(0);
    expect(world.objects.get(offer.x, offer.y)).toMatchObject({ material: "water" });
  });

  it("consumes a scythe before occupying a constructed farm", () => {
    const world = new World(grass(64, 64), undefined, seedRng(1));
    const hut = world.placePlan("farm", { x: 20, y: 20 }, 0)!;
    hut.state = "built";
    world.spawnBearer({ x: 32, y: 32 }, 0);
    for (let i = 0; i < 200; i++) world.tick();
    expect(world.view().movables.some((m) => m.type === "farmer")).toBe(false);
    world.objects.place(goodsStack({ x: 30, y: 30 }, "scythe", 1));
    const n = tickUntil(world, () => world.view().movables.some((m) => m.type === "farmer"));
    expect(n).toBeGreaterThan(0);
    expect(world.objects.get(30, 30)).toBeUndefined();
  });

  it("consumes a fishing rod before occupying a constructed fisher", () => {
    const world = new World(grass(48, 48), undefined, seedRng(1));
    const hut = world.placePlan("fisher", { x: 16, y: 16 }, 0)!;
    hut.state = "built";
    world.spawnBearer({ x: 22, y: 22 }, 0);
    for (let i = 0; i < 200; i++) world.tick();
    expect(world.view().movables.some((m) => m.type === "fisherman")).toBe(false);
    world.objects.place(goodsStack({ x: 20, y: 20 }, "fishingrod", 1));
    const n = tickUntil(world, () => world.view().movables.some((m) => m.type === "fisherman"));
    expect(n).toBeGreaterThan(0);
    expect(world.objects.get(20, 20)).toBeUndefined();
  });
});
