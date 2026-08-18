import { describe, expect, it } from "vitest";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { ObjectGrid } from "../../src/sim/object/object";
import { FogGrid, buildingViewDistance, type FogWorld } from "../../src/sim/fog/fog";
import { viewCircle } from "../../src/sim/fog/viewCircle";
import { World } from "../../src/sim/world/world";

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

function fogWorld(grid: MapGrid, objects?: ObjectGrid): FogWorld {
  return {
    landscapeAt: (x, y) => grid.landscapeAt(x, y),
    heightAt: (x, y) => grid.heightAt(x, y),
    objectAt: (x, y) => objects?.get(x, y),
    buildingAt: () => undefined,
  };
}

function snap(fog: FogGrid, world: FogWorld): void {
  fog.tickDim(10_000, world);
}

describe("buildingViewDistance", () => {
  it("is 0 on the scaffold, 5 on an empty worker hut, def otherwise", () => {
    expect(buildingViewDistance("tower", "plan", false)).toBe(0);
    expect(buildingViewDistance("tower", "building", false)).toBe(0);
    expect(buildingViewDistance("tower", "built", false)).toBe(38);
    expect(buildingViewDistance("lumberjack", "built", false)).toBe(5);
    expect(buildingViewDistance("lumberjack", "built", true)).toBe(0);
  });
});

describe("FogGrid", () => {
  it("lights the inner disk to 100, padding rings step by 10, far tiles stay 0", () => {
    const grid = grass(120, 120);
    const fog = new FogGrid(120, 120);
    const world = fogWorld(grid);
    const at = { x: 60, y: 60 };
    fog.resizeCircle(at, 0, 0, 38);
    snap(fog, world);
    const view = fog.view(0);
    expect(view.sightAt(60, 60)).toBe(100);
    expect(view.isClear(60, 60)).toBe(true);
    expect(view.sightAt(0, 0)).toBe(0);

    const ring = viewCircle(38).find((t) => t.refIndex === 2);
    expect(ring).toBeDefined();
    expect(view.sightAt(at.x + ring!.dx, at.y + ring!.dy)).toBe(80);
  });

  it("never drops a once-seen tile below 50 after the circle is gone", () => {
    const grid = grass(80, 80);
    const fog = new FogGrid(80, 80);
    const world = fogWorld(grid);
    fog.resizeCircle({ x: 40, y: 40 }, 0, 0, 38);
    snap(fog, world);
    fog.resizeCircle({ x: 40, y: 40 }, 0, 38, 0);
    snap(fog, world);
    const view = fog.view(0);
    expect(view.sightAt(40, 40)).toBe(50);
    expect(view.isClear(40, 40)).toBe(false);
    expect(view.isHidden(40, 40)).toBe(true);
  });

  it("freezes the object on the way down through 50, even if live chops it", () => {
    const grid = grass(80, 80);
    const objects = new ObjectGrid(80, 80);
    objects.place({ kind: "tree", x: 40, y: 40, sheet: 0, capacity: 0, stateProgress: 1 });
    const fog = new FogGrid(80, 80);
    const world = fogWorld(grid, objects);
    fog.resizeCircle({ x: 40, y: 40 }, 0, 0, 38);
    snap(fog, world);
    fog.resizeCircle({ x: 40, y: 40 }, 0, 38, 0);
    snap(fog, world);
    objects.remove(40, 40);
    expect(objects.get(40, 40)).toBeUndefined();
    expect(fog.view(0).hiddenAt(40, 40)?.object).toMatchObject({ kind: "tree", x: 40, y: 40 });
  });

  it("walks one sight point per 25 ms tick", () => {
    const grid = grass(40, 40);
    const fog = new FogGrid(40, 40);
    const world = fogWorld(grid);
    fog.resizeCircle({ x: 20, y: 20 }, 0, 0, 8);
    fog.tickDim(25, world);
    expect(fog.view(0).sightAt(20, 20)).toBe(1);
  });
});

describe("world fog", () => {
  it("HQ tower stamps vision; a second tower extends it", () => {
    const world = new World(grass(160, 80));
    expect(world.placeBuilding("tower", { x: 20, y: 40 }, 0)).toBeDefined();
    const fw = fogWorld(world.grid, world.objects);
    world.fog.tickDim(10_000, fw);
    expect(world.view(0).fog.sightAt(20, 40)).toBe(100);
    expect(world.view(0).fog.sightAt(90, 40)).toBe(0);

    expect(world.placeBuilding("tower", { x: 55, y: 40 }, 0)).toBeDefined();
    world.fog.tickDim(10_000, fw);
    expect(world.view(0).fog.sightAt(90, 40)).toBe(100);
  });

  it("units light a disk of 8 even with no hut", () => {
    const world = new World(grass(80, 80));
    world.spawnBearer({ x: 40, y: 40 });
    world.fog.tickDim(10_000, fogWorld(world.grid));
    expect(world.view(0).fog.sightAt(40, 40)).toBe(100);
    expect(world.view(0).fog.sightAt(0, 0)).toBe(0);
  });

  it("destroying a tower dims its disk to explored 50, not black", () => {
    const world = new World(grass(160, 80));
    const at = { x: 20, y: 40 };
    expect(world.placeBuilding("tower", at, 0)).toBeDefined();
    const fw = fogWorld(world.grid, world.objects);
    world.fog.tickDim(10_000, fw);
    expect(world.view(0).fog.sightAt(20, 40)).toBe(100);
    expect(world.destroyBuilding(at)).toBe(true);
    world.fog.tickDim(10_000, fw);
    const fog = world.view(0).fog;
    // Origin stays lit: the garrison walks out and keeps a disk of 8.
    expect(fog.sightAt(50, 40)).toBe(50);
    expect(fog.isClear(50, 40)).toBe(false);
    expect(fog.isHidden(50, 40)).toBe(true);
    expect(world.view(0).buildings).toHaveLength(0);
  });

  it("freezes height when a tile drops through 50", () => {
    const grid = grass(80, 80);
    grid.setHeight(40, 40, 4);
    const fog = new FogGrid(80, 80);
    const world = fogWorld(grid);
    fog.resizeCircle({ x: 40, y: 40 }, 0, 0, 38);
    snap(fog, world);
    fog.resizeCircle({ x: 40, y: 40 }, 0, 38, 0);
    snap(fog, world);
    grid.setHeight(40, 40, 9);
    expect(fog.view(0).hiddenAt(40, 40)?.height).toBe(4);
  });
});
