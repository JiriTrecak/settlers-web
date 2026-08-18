/**
 * L1 swordsman melee: auto-aggro 30, 1s swing, 10 dmg, death unstamps fog.
 */
import { describe, expect, it } from "vitest";
import { hexDist } from "../../src/shared";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { World } from "../../src/sim/world/world";

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

describe("combat", () => {
  it("kills an adjacent L1 in about ten swings", () => {
    const world = new World(grass(64, 64));
    const a = world.spawnSettler("swordsman", { x: 20, y: 20 }, 0);
    const b = world.spawnSettler("swordsman", { x: 21, y: 20 }, 1);
    expect(hexDist(a.pos.x, a.pos.y, b.pos.x, b.pos.y)).toBe(1);
    const n = tickUntil(world, () => !world.movable(a.id) || !world.movable(b.id));
    expect(n).toBeGreaterThan(300);
    expect(n).toBeLessThan(600);
    expect(world.movable(a.id) && world.movable(b.id)).toBeFalsy();
  });

  it("ignores a bearer in range; hits a pioneer", () => {
    const world = new World(grass(64, 64));
    const sword = world.spawnSettler("swordsman", { x: 20, y: 20 }, 0);
    const bearer = world.spawnSettler("bearer", { x: 21, y: 20 }, 1);
    for (let i = 0; i < 200; i++) world.tick();
    expect(world.movable(bearer.id)).toBeDefined();
    expect(sword.job?.type).not.toBe("attack");
    expect(bearer.health).toBe(100);

    const pioneer = world.spawnSettler("pioneer", { x: 19, y: 20 }, 1);
    const n = tickUntil(world, () => !world.movable(pioneer.id));
    expect(n).toBeGreaterThan(300);
    expect(n).toBeLessThan(600);
    expect(world.movable(sword.id)).toBeDefined();
  });

  it("forced walk skips aggro until the path ends", () => {
    const world = new World(grass(80, 80));
    const a = world.spawnSettler("swordsman", { x: 20, y: 20 }, 0);
    world.spawnSettler("swordsman", { x: 21, y: 20 }, 1);
    world.dispatch({ type: "moveTo", id: a.id, to: { x: 20, y: 50 }, forced: true });
    for (let i = 0; i < 40; i++) world.tick();
    expect(a.forcedUntil).toEqual({ x: 20, y: 50 });
    expect(a.walking).toBe(true);
    expect(a.job?.type).not.toBe("attack");
    expect(a.pos.y).toBeGreaterThan(20);
  });

  it("closes from hex 20 and fights", () => {
    const world = new World(grass(80, 80));
    const a = world.spawnSettler("swordsman", { x: 20, y: 20 }, 0);
    const b = world.spawnSettler("swordsman", { x: 40, y: 20 }, 1);
    expect(hexDist(a.pos.x, a.pos.y, b.pos.x, b.pos.y)).toBe(20);
    const n = tickUntil(world, () => !world.movable(a.id) || !world.movable(b.id), 2500);
    expect(n).toBeGreaterThan(100);
    expect(n).toBeLessThan(2500);
  });

  it("removes the corpse and unstamps fog", () => {
    const world = new World(grass(64, 64));
    const a = world.spawnSettler("swordsman", { x: 20, y: 20 }, 0);
    world.spawnSettler("swordsman", { x: 21, y: 20 }, 1);
    world.snapFog();
    expect(world.view(0).fog.isClear(20, 20)).toBe(true);
    tickUntil(world, () => world.view().movables.length === 0);
    expect(world.movable(a.id)).toBeUndefined();
    for (let i = 0; i < 80; i++) world.tick();
    expect(world.view(0).fog.isClear(20, 20)).toBe(false);
  });

  it("converts an empty bearer into a swordsman", () => {
    const world = new World(grass(32, 32));
    const bearer = world.spawnBearer({ x: 16, y: 16 }, 0);
    world.dispatch({ type: "convert", id: bearer.id, to: "swordsman" });
    expect(world.movable(bearer.id)?.type).toBe("swordsman");
    expect(world.movable(bearer.id)?.health).toBe(100);
  });
});
