/** Pioneer: walk off HQ land, kneel 1.2s, take unenforced tiles. */
import { describe, expect, it } from "vitest";
import { TOWER_RADIUS } from "../../src/shared";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { UNOWNED } from "../../src/sim/land/land";
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

describe("pioneer", () => {
  it("walks to a target and claims unenforced tiles toward it", () => {
    const world = new World(grass(160, 120));
    world.land.occupy({ x: 40, y: 60 }, 0, TOWER_RADIUS);
    expect(world.land.playerAt(80, 60)).toBe(0);
    expect(world.land.playerAt(81, 60)).toBe(UNOWNED);
    const pioneer = world.spawnSettler("pioneer", { x: 78, y: 60 }, 0);
    world.dispatch({ type: "pioneerWork", id: pioneer.id, to: { x: 86, y: 60 } });
    const n = tickUntil(world, () => world.land.playerAt(86, 60) === 0);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(4000);
    expect(world.land.isBorder(86, 60) || world.land.isBorder(85, 60)).toBe(true);
  });

  it("does not steal tower-enforced enemy land", () => {
    const world = new World(grass(200, 120));
    world.land.occupy({ x: 40, y: 60 }, 0, TOWER_RADIUS);
    world.land.occupy({ x: 140, y: 60 }, 1, TOWER_RADIUS);
    expect(world.land.towerCountAt(140, 60)).toBeGreaterThan(0);
    expect(world.land.playerAt(140, 60)).toBe(1);
    const pioneer = world.spawnSettler("pioneer", { x: 90, y: 60 }, 0);
    world.dispatch({ type: "pioneerWork", id: pioneer.id, to: { x: 140, y: 60 } });
    for (let i = 0; i < 2500; i++) world.tick();
    expect(world.land.playerAt(140, 60)).toBe(1);
    expect(world.land.towerCountAt(140, 60)).toBeGreaterThan(0);
  });

  it("converts a bearer into a pioneer", () => {
    const world = new World(grass(64, 64));
    world.land.occupy({ x: 32, y: 32 }, 0, TOWER_RADIUS);
    const bearer = world.spawnBearer({ x: 32, y: 32 }, 0);
    world.dispatch({ type: "convert", id: bearer.id, to: "pioneer" });
    expect(world.movable(bearer.id)?.type).toBe("pioneer");
  });

  it("converts a pioneer back only on own land", () => {
    const world = new World(grass(160, 120));
    world.land.occupy({ x: 40, y: 60 }, 0, TOWER_RADIUS);
    const away = world.spawnSettler("pioneer", { x: 90, y: 60 }, 0);
    expect(world.land.playerAt(90, 60)).toBe(UNOWNED);
    world.dispatch({ type: "convert", id: away.id, to: "bearer" });
    expect(away.type).toBe("pioneer");
    const home = world.spawnSettler("pioneer", { x: 40, y: 60 }, 0);
    world.dispatch({ type: "convert", id: home.id, to: "bearer" });
    expect(home.type).toBe("bearer");
  });
});
