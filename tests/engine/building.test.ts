import { describe, expect, it } from "vitest";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { goodsStack, ObjectGrid } from "../../src/sim/object/object";
import { isWalkable } from "../../src/sim/path/path";
import { World } from "../../src/sim/world/world";
import { tower } from "../../src/sim/data/buildings/tower";
import { UNOWNED } from "../../src/sim/land/land";

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

  it("flies a door flag on workerless huts from placement", () => {
    const world = new World(grass(24, 24));
    world.placeBuilding("tower", { x: 8, y: 8 }, 0);
    world.placeBuilding("small_livinghouse", { x: 16, y: 8 }, 0);
    expect(world.view().buildings.map((b) => b.flag)).toEqual(["door", "door"]);
    world.placePlan("tower", { x: 8, y: 16 }, 0);
    expect(world.view().buildings.find((b) => b.y === 16)?.flag).toBe("door");
  });

  it("flies a roof flag only once the hut's own worker occupies", () => {
    const world = new World(grass(24, 24));
    expect(world.placePlan("lumberjack", { x: 10, y: 10 }, 0)).toBeDefined();
    expect(world.view().buildings[0]!.flag).toBeNull();
    const finished = new World(grass(32, 32));
    expect(finished.placeBuilding("lumberjack", { x: 10, y: 10 }, 0)).toBeDefined();
    expect(finished.placeBuilding("sawmill", { x: 22, y: 10 }, 0)).toBeDefined();
    expect(finished.view().buildings.map((b) => b.flag)).toEqual(["roof", "roof"]);
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
    expect(world.view().buildings[0]).toMatchObject({ kind: "lumberjack", x: 10, y: 10, state: "plan", flag: null });
    expect(world.view().movables).toEqual([]);
  });

  it("finished tower stamps occupy land; placement then needs that owner", () => {
    const world = new World(grass(80, 80));
    expect(world.placeBuilding("tower", { x: 16, y: 16 }, 0)).toBeDefined();
    expect(world.land.playerAt(16, 16)).toBe(0);
    expect(world.land.isBorder(16, 16)).toBe(false);
    expect(world.canPlaceBuilding("lumberjack", { x: 28, y: 16 }, 0)).toBe(true);
    expect(world.placePlan("lumberjack", { x: 28, y: 16 }, 0)).toBeDefined();
    expect(world.canPlaceBuilding("lumberjack", { x: 70, y: 16 }, 0)).toBe(false);
    expect(world.placePlan("lumberjack", { x: 70, y: 16 }, 0)).toBeUndefined();
  });

  it("constructed tower extends occupy land once a soldier enters", () => {
    const world = new World(grass(80, 80));
    expect(world.placeBuilding("tower", { x: 16, y: 16 }, 0)).toBeDefined();
    const far = { x: 70, y: 16 };
    const at = { x: 48, y: 16 };
    expect(world.land.playerAt(far.x, far.y)).toBe(UNOWNED);
    expect(world.canPlaceBuilding("lumberjack", far, 0)).toBe(false);
    expect(world.canPlaceBuilding("tower", far, 0)).toBe(false);
    expect(world.placePlan("tower", at, 0)).toBeDefined();
    expect(world.land.playerAt(far.x, far.y)).toBe(UNOWNED);

    for (const slot of tower.constructionStacks) {
      world.objects.place(goodsStack({ x: at.x + slot.dx, y: at.y + slot.dy }, slot.material, slot.required ?? 1));
    }
    world.spawnBearer({ x: at.x + 6, y: at.y }, 0);
    world.spawnBearer({ x: at.x + 6, y: at.y + 2 }, 0);
    world.spawnSettler("swordsman", { x: at.x + 6, y: at.y + 4 }, 0);
    world.objects.place(goodsStack({ x: at.x + 4, y: at.y + 6 }, "hammer", 2));
    world.dispatch({ type: "setBricklayerRatio", ratio: 1, player: 0 });

    let n = 0;
    while (world.land.playerAt(far.x, far.y) !== 0 && n < 8000) {
      world.tick();
      n++;
    }
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(8000);
    expect(world.view().buildings.find((b) => b.x === at.x)).toMatchObject({ state: "built", flag: "door" });
    expect(world.land.playerAt(far.x, far.y)).toBe(0);
    expect(world.canPlaceBuilding("lumberjack", far, 0)).toBe(true);
  });

  it("finished empty tower does not stamp land", () => {
    const world = new World(grass(80, 80));
    expect(world.placeBuilding("tower", { x: 16, y: 16 }, 0)).toBeDefined();
    const at = { x: 48, y: 16 };
    expect(world.placePlan("tower", at, 0)).toBeDefined();
    for (const slot of tower.constructionStacks) {
      world.objects.place(goodsStack({ x: at.x + slot.dx, y: at.y + slot.dy }, slot.material, slot.required ?? 1));
    }
    world.spawnBearer({ x: at.x + 6, y: at.y }, 0);
    world.spawnBearer({ x: at.x + 6, y: at.y + 2 }, 0);
    world.objects.place(goodsStack({ x: at.x + 4, y: at.y + 6 }, "hammer", 2));
    world.dispatch({ type: "setBricklayerRatio", ratio: 1, player: 0 });
    let n = 0;
    while (world.view().buildings.find((b) => b.x === at.x)?.state !== "built" && n < 8000) {
      world.tick();
      n++;
    }
    expect(world.view().buildings.find((b) => b.x === at.x)?.state).toBe("built");
    expect(world.land.playerAt(70, 16)).toBe(UNOWNED);
  });

  it("emptying the garrison unstamps land", () => {
    const world = new World(grass(80, 80));
    expect(world.placeBuilding("tower", { x: 16, y: 16 }, 0)).toBeDefined();
    expect(world.land.playerAt(16, 16)).toBe(0);
    const guard = world.view().movables.find((m) => m.type === "swordsman")!;
    world.movable(guard.id)!.health = 0;
    world.tick();
    expect(world.movable(guard.id)).toBeUndefined();
    expect(world.land.playerAt(16, 16)).toBe(UNOWNED);
  });

  it("removes a hut, unstamps land, and lets you rebuild the plot", () => {
    const world = new World(grass(80, 80));
    const hq = { x: 16, y: 16 };
    const extra = { x: 48, y: 16 };
    expect(world.placeBuilding("tower", hq, 0)).toBeDefined();
    expect(world.placeBuilding("tower", extra, 0)).toBeDefined();
    expect(world.land.playerAt(70, 16)).toBe(0);
    expect(world.destroyBuilding(extra)).toBe(true);
    expect(world.buildings.at(extra.x, extra.y)).toBeUndefined();
    expect(isWalkable(world.grid, extra.x, extra.y, world.buildings)).toBe(true);
    expect(world.land.playerAt(hq.x, hq.y)).toBe(0);
    expect(world.land.playerAt(70, 16)).toBe(UNOWNED);
    expect(world.placeBuilding("tower", extra, 0)).toBeDefined();
  });

  it("kicks the worker out as a bearer", () => {
    const world = new World(grass(32, 32));
    const hut = world.placeBuilding("lumberjack", { x: 10, y: 10 }, 0)!;
    expect(world.view().movables[0]).toMatchObject({ type: "lumberjack", workplaceId: hut.id, inside: true });
    expect(world.destroyBuilding(hut.pos)).toBe(true);
    expect(world.view().movables[0]).toMatchObject({ type: "bearer", workplaceId: null, inside: false });
  });

  it("swordsmen path around a tower, not through the blocked footprint", () => {
    const world = new World(grass(48, 48));
    const at = { x: 24, y: 24 };
    world.placeBuilding("tower", at, 0);
    const s = world.spawnSettler("swordsman", { x: 16, y: 24 }, 0);
    world.dispatch({ type: "moveTo", id: s.id, to: { x: 32, y: 24 }, forced: true });
    const blocked = (x: number, y: number) => world.buildings.blocks(x, y);
    expect(blocked(s.pos.x, s.pos.y)).toBe(false);
    for (const p of s.view().path) expect(blocked(p.x, p.y)).toBe(false);
    for (let i = 0; i < 2000; i++) {
      world.tick();
      expect(blocked(s.pos.x, s.pos.y), `${s.pos.x},${s.pos.y}`).toBe(false);
      if (s.pos.x === 32 && s.pos.y === 24 && !s.walking) break;
    }
    expect(s.pos).toEqual({ x: 32, y: 24 });
  });
});
