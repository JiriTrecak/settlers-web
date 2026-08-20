/** Geologist: convert, probe even-even mountain, plant a resource sign. */
import { describe, expect, it } from "vitest";
import { TOWER_RADIUS } from "../../src/shared";
import { fromOriginalResource, MAX_RESOURCE } from "../../src/sim/map/resource";
import { gridFromDumpedMap, type DumpedMap } from "../../src/sim/map/dumpedMap";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { UNOWNED } from "../../src/sim/land/land";
import { isWalkable } from "../../src/sim/path/path";
import { World } from "../../src/sim/world/world";

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

function mountainPatch(w: number, h: number, x0: number, y0: number, x1: number, y1: number): MapGrid {
  const grid = grass(w, h);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) grid.setLandscape(x, y, "mountain");
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

describe("original resource nibble", () => {
  it("scales amount 0–15 toward 50 and maps type", () => {
    expect(fromOriginalResource(0)).toBeNull();
    expect(fromOriginalResource(0x10)).toBeNull();
    expect(fromOriginalResource(0x11)).toEqual({ kind: "coal", amount: 8 });
    expect(fromOriginalResource(0x1f)?.kind).toBe("coal");
    expect(fromOriginalResource(0x1f)?.amount).toBe(MAX_RESOURCE);
    expect(fromOriginalResource(0x2f)?.kind).toBe("iron");
    expect(fromOriginalResource(0x00)).toBeNull();
    expect(fromOriginalResource(0x70)).toBeNull();
  });

  it("ingests dump resources onto the grid", () => {
    const dump: DumpedMap = {
      width: 4,
      heights: new Array(16).fill(0),
      landscape: new Array(16).fill("grass"),
      trees: [],
      stones: [],
      resources: [{ x: 2, y: 1, type: "gold", amount: 20 }],
    };
    const grid = gridFromDumpedMap(dump);
    expect(grid.resourceAt(2, 1)).toEqual({ kind: "gold", amount: 20 });
    expect(grid.resourceAt(0, 0)).toBeNull();
  });
});

describe("geologist", () => {
  it("converts a bearer into a geologist", () => {
    const world = new World(grass(64, 64));
    world.land.occupy({ x: 32, y: 32 }, 0, TOWER_RADIUS);
    const bearer = world.spawnBearer({ x: 32, y: 32 }, 0);
    world.dispatch({ type: "convert", id: bearer.id, to: "geologist" });
    expect(world.movable(bearer.id)?.type).toBe("geologist");
  });

  it("converts a geologist back only on own land", () => {
    const world = new World(grass(160, 120));
    world.land.occupy({ x: 40, y: 60 }, 0, TOWER_RADIUS);
    const away = world.spawnSettler("geologist", { x: 90, y: 60 }, 0);
    expect(world.land.playerAt(90, 60)).toBe(UNOWNED);
    world.dispatch({ type: "convert", id: away.id, to: "bearer" });
    expect(away.type).toBe("geologist");
    const home = world.spawnSettler("geologist", { x: 40, y: 60 }, 0);
    world.dispatch({ type: "convert", id: home.id, to: "bearer" });
    expect(home.type).toBe("bearer");
  });

  it("walks to a mountain and plants a coal sign on even-even lattice", () => {
    const grid = mountainPatch(40, 40, 6, 6, 14, 14);
    grid.setResource(8, 8, "coal", 50);
    const world = new World(grid);
    const geo = world.spawnSettler("geologist", { x: 10, y: 10 }, 0);
    world.dispatch({ type: "geologistWork", id: geo.id, to: { x: 10, y: 10 } });
    const n = tickUntil(world, () => world.objects.get(8, 8)?.kind === "sign");
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(4000);
    expect(world.objects.get(8, 8)).toMatchObject({ kind: "sign", sign: "coal", stateProgress: 1 });
  });

  it("plants a nothing sign on empty mountain", () => {
    const grid = mountainPatch(40, 40, 6, 6, 14, 14);
    const world = new World(grid);
    const geo = world.spawnSettler("geologist", { x: 10, y: 10 }, 0);
    world.dispatch({ type: "geologistWork", id: geo.id, to: { x: 10, y: 10 } });
    const n = tickUntil(world, () => world.objects.all().some((o) => o.kind === "sign"));
    expect(n).toBeGreaterThan(0);
    const sign = world.objects.all().find((o) => o.kind === "sign");
    expect(sign).toMatchObject({ sign: "nothing", stateProgress: 0 });
    expect((sign!.x & 1) === 0 && (sign!.y & 1) === 0).toBe(true);
  });

  it("does not sign grass or odd coordinates", () => {
    const grid = grass(32, 32);
    grid.setLandscape(11, 10, "mountain");
    grid.setResource(11, 10, "iron", 40);
    const world = new World(grid);
    const geo = world.spawnSettler("geologist", { x: 10, y: 10 }, 0);
    world.dispatch({ type: "geologistWork", id: geo.id, to: { x: 10, y: 10 } });
    for (let i = 0; i < 200; i++) world.tick();
    expect(world.objects.all().some((o) => o.kind === "sign")).toBe(false);
    expect(geo.job).toBeNull();
  });

  it("skips a tile that already has a sign", () => {
    const grid = mountainPatch(40, 40, 6, 6, 14, 14);
    const world = new World(grid);
    world.objects.place({
      kind: "sign",
      x: 8,
      y: 8,
      sheet: 0,
      capacity: 99999,
      stateProgress: 1,
      sign: "coal",
    });
    const geo = world.spawnSettler("geologist", { x: 10, y: 10 }, 0);
    world.dispatch({ type: "geologistWork", id: geo.id, to: { x: 10, y: 10 } });
    const n = tickUntil(world, () => world.objects.all().filter((o) => o.kind === "sign").length >= 2);
    expect(n).toBeGreaterThan(0);
    expect(world.objects.get(8, 8)).toMatchObject({ sign: "coal" });
    expect(world.objects.all().filter((o) => o.kind === "sign").length).toBeGreaterThanOrEqual(2);
  });

  it("expires a sign after its remaining ticks", () => {
    const world = new World(grass(16, 16));
    world.objects.place({
      kind: "sign",
      x: 4,
      y: 4,
      sheet: 0,
      capacity: 2,
      stateProgress: 0.5,
      sign: "iron",
    });
    world.tick();
    expect(world.objects.get(4, 4)?.kind).toBe("sign");
    world.tick();
    expect(world.objects.get(4, 4)).toBeUndefined();
  });

  it("does not block walking", () => {
    const grid = grass(12, 12);
    const world = new World(grid);
    world.objects.place({
      kind: "sign",
      x: 5,
      y: 5,
      sheet: 0,
      capacity: 999,
      stateProgress: 1,
      sign: "gold",
    });
    expect(isWalkable(grid, 5, 5, world.objects)).toBe(true);
    const bearer = world.spawnBearer({ x: 3, y: 5 }, 0);
    world.dispatch({ type: "moveTo", id: bearer.id, to: { x: 8, y: 5 } });
    const n = tickUntil(world, () => bearer.pos.x === 8 && bearer.pos.y === 5);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(400);
  });

  it("idles when the target is walkable but unreachable", () => {
    const grid = mountainPatch(80, 40, 50, 10, 70, 30);
    for (let y = 0; y < 40; y++) grid.setLandscape(40, y, "water8");
    const world = new World(grid);
    const geo = world.spawnSettler("geologist", { x: 10, y: 20 }, 0);
    world.dispatch({ type: "geologistWork", id: geo.id, to: { x: 60, y: 20 } });
    world.tick();
    expect(geo.job).toBeNull();
    expect(geo.view().path).toEqual([]);
  });
});
