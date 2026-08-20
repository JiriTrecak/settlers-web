/** World snapshot: restore equals checksum and continues identically. */
import { describe, expect, it } from "vitest";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { goodsStack } from "../../src/sim/object/object";
import { seedRng } from "../../src/sim/rng/rng";
import { World } from "../../src/sim/world/world";
import { parseWorldSnapshot } from "../../src/sim/world/snapshot";

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

function kit(): World {
  const world = new World(grass(64, 64), undefined, seedRng(1));
  world.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
  world.dispatch({ type: "placeColony", at: { x: 48, y: 48 }, player: 1 });
  return world;
}

function roundtrip(world: World): World {
  const json = JSON.parse(JSON.stringify(world.snapshot())) as unknown;
  const parsed = parseWorldSnapshot(json);
  expect(parsed).not.toBeNull();
  const restored = World.fromSnapshot(parsed!);
  expect(restored).not.toBeNull();
  return restored!;
}

describe("world snapshot", () => {
  it("JSON roundtrip matches checksum at kit", () => {
    const a = kit();
    const b = roundtrip(a);
    expect(b.checksum()).toBe(a.checksum());
    expect(b.clock.tickIndex).toBe(a.clock.tickIndex);
    expect(b.log()).toEqual(a.log());
  });

  it("continues the same as the original after restore", () => {
    const a = kit();
    for (let i = 0; i < 80; i++) a.tick();
    const b = roundtrip(a);
    expect(b.checksum()).toBe(a.checksum());
    for (let i = 0; i < 120; i++) {
      a.tick();
      b.tick();
    }
    expect(b.checksum()).toBe(a.checksum());
    expect(b.clock.tickIndex).toBe(a.clock.tickIndex);
  });

  it("keeps pending actions scheduled past the save tick", () => {
    const a = kit();
    a.enqueue({ type: "placeBuilding", kind: "lumberjack", at: { x: 20, y: 40 }, player: 0 }, 25);
    const b = roundtrip(a);
    expect(b.buildings.at(20, 40)).toBeUndefined();
    while (b.clock.tickIndex < 25) b.tick();
    expect(b.buildings.at(20, 40)?.kind).toBe("lumberjack");
    while (a.clock.tickIndex < 25) a.tick();
    expect(a.checksum()).toBe(b.checksum());
  });

  it("preserves unit ids, jobs, and mid-step walks", () => {
    const a = kit();
    a.enqueue({ type: "placeBuilding", kind: "lumberjack", at: { x: 20, y: 40 }, player: 0 }, 2);
    for (let i = 0; i < 40; i++) a.tick();
    const before = a.view().movables.map((m) => ({ id: m.id, type: m.type, job: m.job, x: m.pos.x, y: m.pos.y, prog: m.moveProgress }));
    expect(before.some((m) => m.prog > 0 && m.prog < 1 || m.job != null)).toBe(true);
    const b = roundtrip(a);
    expect(b.view().movables.map((m) => ({ id: m.id, type: m.type, job: m.job, x: m.pos.x, y: m.pos.y, prog: m.moveProgress }))).toEqual(
      before,
    );
    expect(b.checksum()).toBe(a.checksum());
  });

  it("preserves ratios, hammers, and flattened height", () => {
    const a = kit();
    a.dispatch({ type: "setDiggerRatio", ratio: 0.5, player: 0 });
    a.dispatch({ type: "setBricklayerRatio", ratio: 0.4, player: 0 });
    a.grid.setHeight(10, 10, 3);
    a.objects.place(goodsStack({ x: 22, y: 22 }, "hammer", 3));
    for (let i = 0; i < 30; i++) a.tick();
    const b = roundtrip(a);
    expect(b.diggerRatio(0)).toBe(a.diggerRatio(0));
    expect(b.bricklayerRatio(0)).toBe(a.bricklayerRatio(0));
    expect(b.grid.heightAt(10, 10)).toBe(3);
    expect(b.objects.get(22, 22)).toMatchObject({ material: "hammer", capacity: 3 });
    expect(b.checksum()).toBe(a.checksum());
  });

  it("preserves rng so flock diverges if we skip restore", () => {
    const a = kit();
    for (let i = 0; i < 50; i++) a.tick();
    const b = roundtrip(a);
    const c = kit();
    for (let i = 0; i < 50; i++) c.tick();
    expect(c.checksum()).toBe(a.checksum());
    a.tick();
    b.tick();
    c.tick();
    expect(b.checksum()).toBe(a.checksum());
  });

  it("rejects a truncated blob", () => {
    const a = kit();
    const raw = a.snapshot() as unknown as Record<string, unknown>;
    delete raw.units;
    expect(parseWorldSnapshot(raw)).toBeNull();
    expect(World.fromSnapshot(a.snapshot())).not.toBeNull();
  });

  it("restores fog even though checksum ignores it", () => {
    const a = kit();
    for (let i = 0; i < 20; i++) a.tick();
    const hq = a.buildings.at(32, 32);
    expect(hq?.hq).toBe(true);
    const sight = a.view(0).fog.sightAt(32, 32);
    expect(sight).toBe(100);
    const b = roundtrip(a);
    expect(b.view(0).fog.sightAt(32, 32)).toBe(sight);
    expect(b.checksum()).toBe(a.checksum());
  });

  it("preserves Victory after HQ destroy", () => {
    const a = new World(grass(120, 80), undefined, seedRng(1));
    a.dispatch({ type: "placeColony", at: { x: 16, y: 20 }, player: 0 });
    a.dispatch({ type: "placeColony", at: { x: 90, y: 20 }, player: 1 });
    const hq1 = [...a.buildings.all()].find((b) => b.hq && b.player === 1);
    expect(hq1).toBeDefined();
    a.enqueue({ type: "destroyBuilding", at: hq1!.pos }, 1, { player: 1 });
    let n = 0;
    while (a.outcome == null && n++ < 8) a.tick();
    expect(a.outcome).toEqual({ winner: 0, defeated: [1] });
    const b = roundtrip(a);
    expect(b.outcome).toEqual(a.outcome);
    expect(b.checksum()).toBe(a.checksum());
    expect(b.hasHq(1)).toBe(false);
    expect(b.hasHq(0)).toBe(true);
  });

  it("restores a moved work area", () => {
    const a = kit();
    const hut = a.placeBuilding("lumberjack", { x: 20, y: 40 }, 0)!;
    expect(a.setWorkArea(hut.pos, { x: 28, y: 36 })).toBe(true);
    const b = roundtrip(a);
    const restored = b.buildings.at(20, 40);
    expect(restored?.work).toEqual({ x: 28, y: 36 });
    expect(b.checksum()).toBe(a.checksum());
  });
});
