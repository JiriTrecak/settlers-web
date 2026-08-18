/**
 * Two colonies in one match: land, fog, matcher isolation, script opponent.
 */
import { describe, expect, it } from "vitest";
import { FOG_VISIBLE } from "../../src/sim/fog/fog";
import { placeColony } from "../../src/sim/economy/startKit";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { UNOWNED } from "../../src/sim/land/land";
import { goodsStack } from "../../src/sim/object/object";
import { World } from "../../src/sim/world/world";
import { sawmill as millDef } from "../../src/sim/data/buildings/sawmill";
import {
  Opponent,
  OPPONENT_CONVERT_TICK,
  OPPONENT_TOWER_TICK,
} from "../../src/session/opponent/opponent";

const P0 = { x: 40, y: 40 };
const P1 = { x: 140, y: 140 };

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

function twoColonies(): World {
  const world = new World(grass(200, 200));
  placeColony(world, P0, 0);
  placeColony(world, P1, 1);
  return world;
}

function firstPlace(world: World, kind: "lumberjack" | "sawmill" | "tower", player: number) {
  for (let y = 0; y < world.grid.height; y++) {
    for (let x = 0; x < world.grid.width; x++) {
      if (world.canPlaceBuilding(kind, { x, y }, player)) return { x, y };
    }
  }
  return null;
}

describe("two colonies", () => {
  it("stamps two disks, grey between, two rims", () => {
    const world = twoColonies();
    expect(world.land.playerAt(P0.x, P0.y)).toBe(0);
    expect(world.land.playerAt(P1.x, P1.y)).toBe(1);
    expect(world.land.playerAt(90, 90)).toBe(UNOWNED);
    expect(world.land.hasPlayer(0)).toBe(true);
    expect(world.land.hasPlayer(1)).toBe(true);
    expect(world.view().buildings.filter((b) => b.kind === "tower")).toHaveLength(2);

    let rim0 = 0;
    let rim1 = 0;
    for (let y = 0; y < world.grid.height; y++) {
      for (let x = 0; x < world.grid.width; x++) {
        if (!world.land.isBorder(x, y)) continue;
        if (world.land.playerAt(x, y) === 0) rim0 += 1;
        if (world.land.playerAt(x, y) === 1) rim1 += 1;
      }
    }
    expect(rim0).toBeGreaterThan(0);
    expect(rim1).toBeGreaterThan(0);
  });

  it("hides the enemy HQ and units at sight 0; extra towers still need owned land", () => {
    const world = twoColonies();
    const fog0 = world.view(0).fog;
    expect(fog0.sightAt(P0.x, P0.y)).toBe(FOG_VISIBLE);
    expect(fog0.sightAt(P1.x, P1.y)).toBe(0);
    expect(fog0.isClear(90, 90)).toBe(false);
    expect(world.view(1).fog.sightAt(P0.x, P0.y)).toBe(0);

    const enemy = world.view().movables.find((m) => m.player === 1 && !m.inside);
    expect(enemy).toBeDefined();
    expect(fog0.isClear(enemy!.pos.x, enemy!.pos.y)).toBe(false);

    const theirs = firstPlace(world, "lumberjack", 1);
    expect(theirs).not.toBeNull();
    expect(world.canPlaceBuilding("lumberjack", theirs!, 0)).toBe(false);

    expect(world.land.playerAt(90, 90)).toBe(UNOWNED);
    expect(world.canPlaceBuilding("tower", { x: 90, y: 90 }, 0)).toBe(false);
    expect(world.canPlaceBuilding("tower", { x: 90, y: 90 }, 1)).toBe(false);
  });

  it("does not haul the other colony's trunks", () => {
    const world = twoColonies();
    const millAt = firstPlace(world, "sawmill", 0);
    expect(millAt).not.toBeNull();
    expect(world.placeBuilding("sawmill", millAt!, 0)).toBeDefined();
    const request = { x: millAt!.x + millDef.requestStacks[0]!.dx, y: millAt!.y + millDef.requestStacks[0]!.dy };

    let offer: { x: number; y: number } | null = null;
    for (let y = P1.y - 20; y <= P1.y + 20 && !offer; y++) {
      for (let x = P1.x - 20; x <= P1.x + 20; x++) {
        if (world.land.playerAt(x, y) !== 1) continue;
        if (world.objects.get(x, y)) continue;
        if (world.buildings.protects(x, y)) continue;
        offer = { x, y };
        break;
      }
    }
    expect(offer).not.toBeNull();
    world.objects.place(goodsStack(offer!, "trunk", 3));

    for (let i = 0; i < 400; i++) world.tick();
    expect(world.objects.get(offer!.x, offer!.y)).toMatchObject({ kind: "stack", material: "trunk", capacity: 3 });
    expect(world.objects.get(request.x, request.y)).toBeUndefined();
    expect(world.view().movables.filter((m) => m.player === 0 && m.job === "deliver")).toEqual([]);
  });
});

describe("opponent script", () => {
  it("converts a pioneer toward the human, then plans a tower", () => {
    const world = twoColonies();
    const opp = new Opponent(1, P1, P0);
    for (let i = 0; i < OPPONENT_CONVERT_TICK + 2; i++) {
      world.tick();
      opp.onTick(world);
    }
    expect(world.log().some((a) => a.action.type === "convert" && a.player === 1)).toBe(true);
    expect(world.log().some((a) => a.action.type === "pioneerWork" && a.player === 1)).toBe(true);
    expect(world.view().movables.some((m) => m.player === 1 && m.type === "pioneer")).toBe(true);

    for (let i = 0; i < OPPONENT_TOWER_TICK; i++) {
      world.tick();
      opp.onTick(world);
    }
    const towerPlan = world.log().find((a) => a.action.type === "placeBuilding" && a.action.kind === "tower");
    expect(towerPlan).toMatchObject({ player: 1 });
    expect(world.view().buildings.some((b) => b.kind === "tower" && b.player === 1 && b.state === "plan")).toBe(true);
  });
});
