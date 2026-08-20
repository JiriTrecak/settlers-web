/** Outdoor hut work circle: search origin is `hut.work`, radius stays the def. Axial, not hex. */
import { describe, expect, it } from "vitest";
import { hexDist } from "../../src/shared";
import { lumberjack as hutDef } from "../../src/sim/data/buildings/lumberjack";
import { forester as forestDef } from "../../src/sim/data/buildings/forester";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { ObjectGrid } from "../../src/sim/object/object";
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

describe("work area", () => {
  it("defaults to the hut origin", () => {
    const world = new World(grass(32, 32));
    const hut = world.placeBuilding("lumberjack", { x: 12, y: 12 }, 0)!;
    expect(hut.work).toEqual(hut.pos);
  });

  it("chops inside the moved circle and ignores the tree next to the hut", () => {
    const near = { x: 20, y: 16 };
    const far = { x: 16, y: 51 };
    const objects = new ObjectGrid(64, 64);
    objects.place({ kind: "tree", x: near.x, y: near.y, sheet: 0, capacity: 0, stateProgress: 1 });
    objects.place({ kind: "tree", x: far.x, y: far.y, sheet: 0, capacity: 0, stateProgress: 1 });
    const world = new World(grass(64, 64), objects);
    const at = { x: 16, y: 16 };
    expect(hexDist(at.x, at.y, near.x, near.y)).toBeLessThanOrEqual(hutDef.workRadius);
    expect(hexDist(at.x, at.y, far.x, far.y)).toBeGreaterThan(hutDef.workRadius);
    const hut = world.placeBuilding("lumberjack", at, 0)!;
    const work = { x: 16, y: 48 };
    expect(hexDist(work.x, work.y, far.x, far.y)).toBeLessThanOrEqual(hutDef.workRadius);
    expect(hexDist(work.x, work.y, near.x, near.y)).toBeGreaterThan(hutDef.workRadius);
    expect(world.setWorkArea(hut.pos, work)).toBe(true);
    expect(hut.work).toEqual(work);

    const n = tickUntil(world, () => world.objects.get(far.x, far.y) == null, 8000);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(8000);
    expect(world.objects.get(far.x, far.y)).toBeUndefined();
    expect(world.objects.get(near.x, near.y)?.kind).toBe("tree");
  });

  it("plants inside the moved circle, not around the hut", () => {
    const world = new World(grass(64, 64));
    const at = { x: 16, y: 16 };
    const hut = world.placeBuilding("forester", at, 0)!;
    const work = { x: 16, y: 40 };
    expect(world.setWorkArea(hut.pos, work)).toBe(true);
    tickUntil(world, () => world.objects.all().some((o) => o.kind === "tree" && o.growing), 4000);
    const saplings = world.objects.all().filter((o) => o.kind === "tree");
    expect(saplings.length).toBeGreaterThan(0);
    for (const s of saplings) {
      expect(hexDist(work.x, work.y, s.x, s.y)).toBeLessThanOrEqual(forestDef.workRadius + 1);
      expect(hexDist(at.x, at.y, s.x, s.y)).toBeGreaterThan(forestDef.workRadius);
    }
  });

  it("refuses indoor huts and out-of-bounds centers", () => {
    const world = new World(grass(32, 32));
    const mill = world.placeBuilding("sawmill", { x: 12, y: 12 }, 0)!;
    expect(world.setWorkArea(mill.pos, { x: 16, y: 12 })).toBe(false);
    expect(mill.work).toEqual(mill.pos);
    const world2 = new World(grass(32, 32));
    const hut = world2.placeBuilding("lumberjack", { x: 12, y: 12 }, 0)!;
    expect(world2.setWorkArea(hut.pos, { x: 99, y: 99 })).toBe(false);
    expect(hut.work).toEqual(hut.pos);
  });

  it("mixes the work origin into checksum", () => {
    const a = new World(grass(32, 32));
    const b = new World(grass(32, 32));
    a.placeBuilding("lumberjack", { x: 12, y: 12 }, 0);
    b.placeBuilding("lumberjack", { x: 12, y: 12 }, 0);
    expect(a.checksum()).toBe(b.checksum());
    a.setWorkArea({ x: 12, y: 12 }, { x: 18, y: 12 });
    expect(a.checksum()).not.toBe(b.checksum());
  });
});
