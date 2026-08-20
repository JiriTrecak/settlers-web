/** Action queue + checksum: same log ⇒ same mix; a perturbed action diverges. */
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

function kit(): World {
  return new World(grass(64, 64));
}

function run(world: World, n: number): void {
  for (let i = 0; i < n; i++) world.tick();
}

describe("action queue", () => {
  it("applies enqueue on the next beat, dispatch immediately", () => {
    const world = kit();
    world.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
    expect(world.buildings.at(32, 32)?.kind).toBe("tower");
    expect(world.clock.tickIndex).toBe(0);
    expect(world.log()).toEqual([
      { tick: 0, player: 0, action: { type: "placeColony", at: { x: 32, y: 32 }, player: 0 } },
    ]);

    world.enqueue({ type: "destroyBuilding", at: { x: 32, y: 32 } });
    expect(world.buildings.at(32, 32)?.kind).toBe("tower");
    world.tick();
    expect(world.clock.tickIndex).toBe(1);
    expect(world.buildings.at(32, 32)).toBeUndefined();
  });

  it("applies same-tick actions by player then seq, even if enqueued out of order", () => {
    const world = kit();
    world.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
    world.dispatch({ type: "placeColony", at: { x: 48, y: 48 }, player: 1 });
    world.enqueue({ type: "placeBuilding", kind: "lumberjack", at: { x: 20, y: 40 }, player: 1 }, 1, { player: 1, seq: 0 });
    world.enqueue({ type: "placeBuilding", kind: "stonecutter", at: { x: 22, y: 40 }, player: 0 }, 1, { player: 0, seq: 0 });
    world.tick();
    const kinds = world
      .log()
      .filter((e) => e.tick === 1 && e.action.type === "placeBuilding")
      .map((e) => (e.action.type === "placeBuilding" ? e.action.kind : ""));
    expect(kinds).toEqual(["stonecutter", "lumberjack"]);
  });
});

describe("checksum", () => {
  it("matches across two worlds after the same kit and ticks", () => {
    const a = kit();
    const b = kit();
    a.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
    b.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
    run(a, 120);
    run(b, 120);
    expect(a.checksum()).toBe(b.checksum());
    expect(a.checksum()).not.toBe(0);
  });

  it("diverges when one world gets an extra action", () => {
    const a = kit();
    const b = kit();
    a.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
    b.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
    b.enqueue({ type: "placeBuilding", kind: "lumberjack", at: { x: 20, y: 40 }, player: 0 }, 40);
    run(a, 80);
    run(b, 80);
    expect(a.checksum()).not.toBe(b.checksum());
  });

  it("replay of the log matches the original checksum", () => {
    const a = kit();
    a.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
    a.enqueue({ type: "placeBuilding", kind: "lumberjack", at: { x: 20, y: 40 }, player: 0 }, 20);
    run(a, 80);
    const b = kit();
    b.replay(a.log(), a.clock.tickIndex);
    expect(b.checksum()).toBe(a.checksum());
  });

  it("does not mix fog into checksum, so two peers can dim independently", () => {
    const a = kit();
    const b = kit();
    a.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
    b.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
    expect(a.checksum()).toBe(b.checksum());
    a.fog.resizeCircle({ x: 32, y: 32 }, 0, 38, 0);
    expect(JSON.stringify(a.snapshot().fog)).not.toBe(JSON.stringify(b.snapshot().fog));
    expect(a.checksum()).toBe(b.checksum());
  });

  it("mixes digger and bricklayer ratios so a Tools click desyncs a peer who missed it", () => {
    const a = kit();
    const b = kit();
    a.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
    b.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
    a.dispatch({ type: "setDiggerRatio", ratio: 0.5, player: 0 });
    expect(a.checksum()).not.toBe(b.checksum());
    b.dispatch({ type: "setDiggerRatio", ratio: 0.5, player: 0 });
    expect(a.checksum()).toBe(b.checksum());
  });
});
