/**
 * Tower assault: break the door, garrison comes out, empty hut flips owner.
 * Colony HQ gone (capture or destroy) ends that player.
 */
import { describe, expect, it } from "vitest";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { UNOWNED } from "../../src/sim/land/land";
import { World } from "../../src/sim/world/world";
import { buildingDef } from "../../src/sim/data/buildings";

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

function doorOf(hut: { pos: { x: number; y: number }; kind: "tower" }): { x: number; y: number } {
  const d = buildingDef("tower").door;
  return { x: hut.pos.x + d.dx, y: hut.pos.y + d.dy };
}

describe("tower assault", () => {
  it("captures an empty enemy T1 and stamps land after enter", () => {
    const world = new World(grass(120, 80));
    world.placeBuilding("tower", { x: 16, y: 20 }, 0);
    const theirs = world.placeBuilding("tower", { x: 90, y: 20 }, 1)!;
    expect(theirs).toBeDefined();
    const guard = world.view().movables.find((m) => m.player === 1 && m.type === "swordsman")!;
    world.movable(guard.id)!.health = 0;
    world.tick();
    expect(theirs.player).toBe(1);
    expect(world.land.playerAt(90, 20)).toBe(UNOWNED);

    const door = doorOf(theirs);
    world.spawnSettler("swordsman", { x: door.x + 2, y: door.y }, 0);
    const n = tickUntil(world, () => theirs.player === 0);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(8000);
    expect(world.outcome).toBeNull();
    tickUntil(world, () => world.view().movables.some((m) => m.player === 0 && m.inside && m.workplaceId === theirs.id));
    expect(world.land.playerAt(90, 20)).toBe(0);
  });

  it("kicks the garrison when the door breaks, then flips", () => {
    const world = new World(grass(120, 80));
    world.placeBuilding("tower", { x: 16, y: 20 }, 0);
    const theirs = world.placeBuilding("tower", { x: 90, y: 20 }, 1)!;
    const door = doorOf(theirs);
    world.spawnSettler("swordsman", { x: door.x + 2, y: door.y }, 0);
    world.spawnSettler("swordsman", { x: door.x + 2, y: door.y + 1 }, 0);
    const n = tickUntil(world, () => theirs.player === 0);
    expect(n).toBeGreaterThan(100);
    expect(n).toBeLessThan(8000);
    expect(world.view().movables.some((m) => m.player === 1)).toBe(false);
  });

  it("capturing the colony HQ defeats that player", () => {
    const world = new World(grass(120, 80));
    const hq0 = world.placeBuilding("tower", { x: 16, y: 20 }, 0)!;
    const hq1 = world.placeBuilding("tower", { x: 90, y: 20 }, 1)!;
    world.setHq(hq0);
    world.setHq(hq1);
    const door = doorOf(hq1);
    world.spawnSettler("swordsman", { x: door.x + 2, y: door.y }, 0);
    world.spawnSettler("swordsman", { x: door.x + 2, y: door.y + 1 }, 0);
    tickUntil(world, () => world.outcome != null);
    expect(hq1.player).toBe(0);
    expect(hq1.hq).toBe(false);
    expect(world.outcome).toEqual({ winner: 0, defeated: [1] });
  });

  it("destroying the HQ ends a one-player match as defeat", () => {
    const world = new World(grass(40, 40));
    const hq = world.placeBuilding("tower", { x: 16, y: 16 }, 0)!;
    world.setHq(hq);
    expect(world.destroyBuilding(hq.pos)).toBe(true);
    expect(world.outcome).toEqual({ winner: null, defeated: [0] });
  });

  it("a 3p match keeps going after the first HQ dies", () => {
    const world = new World(grass(200, 80));
    const hq0 = world.placeBuilding("tower", { x: 16, y: 16 }, 0)!;
    const hq1 = world.placeBuilding("tower", { x: 90, y: 16 }, 1)!;
    const hq2 = world.placeBuilding("tower", { x: 164, y: 16 }, 2)!;
    world.setHq(hq0);
    world.setHq(hq1);
    world.setHq(hq2);
    expect(world.destroyBuilding(hq1.pos)).toBe(true);
    expect(world.outcome).toBeNull();
    expect(world.hasHq(0)).toBe(true);
    expect(world.hasHq(2)).toBe(true);
    expect(world.destroyBuilding(hq2.pos)).toBe(true);
    expect(world.outcome).toEqual({ winner: 0, defeated: [1, 2] });
  });

  it("destroying an extra T1 does not end the match", () => {
    const world = new World(grass(80, 80));
    const hq = world.placeBuilding("tower", { x: 16, y: 16 }, 0)!;
    world.setHq(hq);
    const extra = world.placeBuilding("tower", { x: 48, y: 16 }, 0)!;
    expect(world.destroyBuilding(extra.pos)).toBe(true);
    expect(world.outcome).toBeNull();
    expect(world.buildings.get(hq.id)?.hq).toBe(true);
  });
});
