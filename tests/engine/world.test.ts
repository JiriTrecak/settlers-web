import { describe, expect, it } from "vitest";
import { DIRECTIONS, deltaOf, directionFromDelta } from "../../src/shared/direction/direction";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { findPath, isWalkable } from "../../src/sim/path/path";
import { UNOWNED } from "../../src/sim/land/land";
import { World } from "../../src/sim/world/world";

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

describe("path", () => {
  it("returns empty path when already there", () => {
    const grid = grass(8, 8);
    expect(findPath(grid, { x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([]);
  });

  it("walks around water", () => {
    const grid = grass(8, 8);
    for (let y = 0; y < 8; y++) grid.setLandscape(3, y, "water8");
    grid.setLandscape(3, 4, "grass");
    const path = findPath(grid, { x: 1, y: 4 }, { x: 5, y: 4 });
    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual({ x: 5, y: 4 });
    expect(path!.every((p) => isWalkable(grid, p.x, p.y))).toBe(true);
    expect(path!.some((p) => p.x === 3 && p.y !== 4)).toBe(false);
  });

  it("returns null for water goals", () => {
    const grid = grass(8, 8);
    grid.setLandscape(4, 4, "water8");
    expect(findPath(grid, { x: 1, y: 1 }, { x: 4, y: 4 })).toBeNull();
  });
});

describe("world", () => {
  it("occupies the neighbor after one step of ticks, only via moveTo", () => {
    const world = new World(grass(12, 12));
    const bearer = world.spawnBearer({ x: 3, y: 3 });
    const stepTicks = bearer.stepTicks;
    world.dispatch({ type: "moveTo", id: bearer.id, to: { x: 4, y: 3 } });
    expect(world.view().movables[0]).toMatchObject({
      pos: { x: 4, y: 3 },
      from: { x: 3, y: 3 },
      action: "walk",
      moveProgress: 0,
      path: [],
    });
    expect(world.view().movables[0]!.player).toBe(0);
    expect(world.view().objects).toEqual([]);
    const red = new World(grass(12, 12)).spawnBearer({ x: 3, y: 3 }, 1);
    expect(red.player).toBe(1);
    for (const dir of DIRECTIONS) {
      const d = deltaOf(dir);
      expect(directionFromDelta(d.dx, d.dy)).toBe(dir);
    }

    for (let i = 0; i < stepTicks - 1; i++) world.tick();
    const mid = world.view().movables[0]!;
    expect(mid.pos).toEqual({ x: 4, y: 3 });
    expect(mid.moveProgress).toBeGreaterThan(0);
    expect(mid.moveProgress).toBeLessThan(1);
    expect(mid.action).toBe("walk");

    world.tick();
    const done = world.view().movables[0]!;
    expect(done.pos).toEqual({ x: 4, y: 3 });
    expect(done.from).toEqual({ x: 4, y: 3 });
    expect(done.action).toBe("idle");
    expect(done.moveProgress).toBe(0);
  });

  it("view matches internal state after a multi-tile walk", () => {
    const world = new World(grass(12, 12));
    const bearer = world.spawnBearer({ x: 2, y: 2 });
    world.dispatch({ type: "moveTo", id: bearer.id, to: { x: 4, y: 2 } });
    expect(world.view().movables[0]).toMatchObject({
      pos: { x: 3, y: 2 },
      path: [{ x: 4, y: 2 }],
    });
    const ticks = bearer.stepTicks * 2;
    for (let i = 0; i < ticks; i++) world.tick();
    const v = world.view().movables[0]!;
    expect(v.pos).toEqual({ x: 4, y: 2 });
    expect(v.action).toBe("idle");
    expect(v.path).toEqual([]);
    expect(world.view().tick).toBe(ticks);
  });

  it("needsPlayersGround settlers cannot path onto unowned land", () => {
    const world = new World(grass(40, 40));
    world.land.occupy({ x: 10, y: 10 }, 0, 8);
    const bearer = world.spawnBearer({ x: 10, y: 10 });
    world.dispatch({ type: "moveTo", id: bearer.id, to: { x: 30, y: 10 } });
    expect(world.land.playerAt(30, 10)).toBe(UNOWNED);
    expect(world.view().movables[0]).toMatchObject({ pos: { x: 10, y: 10 }, path: [] });
  });
});
