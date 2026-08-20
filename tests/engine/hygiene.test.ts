/** Envelope reject: foreign commands and late placeColony are no-ops. */
import { describe, expect, it } from "vitest";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { World } from "../../src/sim/world/world";

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

function two(): World {
  const world = new World(grass(64, 64));
  world.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
  world.dispatch({ type: "placeColony", at: { x: 48, y: 48 }, player: 1 });
  return world;
}

describe("action envelope", () => {
  it("drops a unit command whose id is not that player's", () => {
    const world = two();
    const u0 = world.view(0).movables.find((m) => m.player === 0);
    expect(u0).toBeDefined();
    world.enqueue({ type: "moveTo", id: u0!.id, to: { x: 10, y: 10 } }, 1, { player: 1 });
    world.tick();
    expect(world.log().some((e) => e.action.type === "moveTo")).toBe(false);
  });

  it("drops destroyBuilding on a hut they do not own", () => {
    const world = two();
    world.enqueue({ type: "destroyBuilding", at: { x: 32, y: 32 } }, 1, { player: 1 });
    world.tick();
    expect(world.buildings.at(32, 32)?.kind).toBe("tower");
    expect(world.log().some((e) => e.action.type === "destroyBuilding")).toBe(false);
  });

  it("drops placeBuilding stamped for a different player", () => {
    const world = two();
    world.enqueue(
      { type: "placeBuilding", kind: "lumberjack", at: { x: 20, y: 40 }, player: 1 },
      1,
      { player: 0 },
    );
    world.tick();
    expect(world.buildings.at(20, 40)).toBeUndefined();
  });

  it("drops placeColony after tick 0", () => {
    const world = two();
    world.tick();
    world.enqueue({ type: "placeColony", at: { x: 16, y: 16 }, player: 0 }, 2, { player: 0 });
    world.tick();
    expect(world.buildings.at(16, 16)).toBeUndefined();
  });

  it("drops a foreign setDiggerRatio", () => {
    const world = two();
    world.enqueue({ type: "setDiggerRatio", ratio: 1, player: 1 }, 1, { player: 0 });
    world.tick();
    expect(world.diggerRatio(1)).toBe(0.25);
    expect(world.log().some((e) => e.action.type === "setDiggerRatio")).toBe(false);
  });

  it("drops a foreign setBricklayerRatio", () => {
    const world = two();
    world.enqueue({ type: "setBricklayerRatio", ratio: 1, player: 1 }, 1, { player: 0 });
    world.tick();
    expect(world.bricklayerRatio(1)).toBe(0.25);
    expect(world.log().some((e) => e.action.type === "setBricklayerRatio")).toBe(false);
  });

  it("applies an owned setBricklayerRatio", () => {
    const world = two();
    world.enqueue({ type: "setBricklayerRatio", ratio: 0.5, player: 0 }, 1, { player: 0 });
    world.tick();
    expect(world.bricklayerRatio(0)).toBe(0.5);
    expect(world.bricklayerRatio(1)).toBe(0.25);
  });

  it("applies an owned command with envelope player + seq", () => {
    const world = two();
    const u0 = world.view(0).movables.find((m) => m.player === 0 && !m.inside);
    expect(u0).toBeDefined();
    world.enqueue({ type: "moveTo", id: u0!.id, to: { x: 10, y: 10 } }, 1, { player: 0, seq: 0 });
    world.tick();
    expect(world.log().some((e) => e.action.type === "moveTo" && e.player === 0)).toBe(true);
    expect(world.view(0).movables.find((m) => m.id === u0!.id)?.path.length).toBeGreaterThan(0);
  });

  it("applies same-player seq 0 before seq 1 even if enqueued backwards", () => {
    const world = two();
    world.enqueue({ type: "setDiggerRatio", ratio: 0, player: 0 }, 1, { player: 0, seq: 1 });
    world.enqueue({ type: "setDiggerRatio", ratio: 0.5, player: 0 }, 1, { player: 0, seq: 0 });
    world.tick();
    expect(world.diggerRatio(0)).toBe(0);
    expect(world.log().filter((e) => e.action.type === "setDiggerRatio").map((e) => e.action)).toEqual([
      { type: "setDiggerRatio", ratio: 0.5, player: 0 },
      { type: "setDiggerRatio", ratio: 0, player: 0 },
    ]);
  });

  it("drops a foreign setWorkArea", () => {
    const world = new World(grass(64, 64));
    const hut = world.placeBuilding("lumberjack", { x: 16, y: 16 }, 0)!;
    world.enqueue({ type: "setWorkArea", at: hut.pos, center: { x: 24, y: 16 } }, 1, { player: 1 });
    world.tick();
    expect(hut.work).toEqual({ x: 16, y: 16 });
    expect(world.log().some((e) => e.action.type === "setWorkArea")).toBe(false);
  });
});
