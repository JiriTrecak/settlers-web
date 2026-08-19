/** N Worlds, one Room: same commits ⇒ same checksum. Stall without every slot's confirm. */
import { describe, expect, it } from "vitest";
import { localMatch, type Commit } from "../../src/shared";
import { Lockstep, MemoryChannel, Room } from "../../src/net";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { World } from "../../src/sim/world/world";
import { seedRng } from "../../src/sim/rng/rng";

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

function kit(seed: number): World {
  const world = new World(grass(64, 64), undefined, seedRng(seed));
  world.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
  world.dispatch({ type: "placeColony", at: { x: 48, y: 48 }, player: 1 });
  return world;
}

function apply(world: World, commit: Commit): void {
  for (const slot of commit.slots) {
    for (let i = 0; i < slot.actions.length; i++) {
      world.enqueue(slot.actions[i]!, commit.tick, { player: slot.player, seq: i });
    }
  }
}

describe("lockstep MemoryChannel", () => {
  it("two worlds on one Room share checksums after the same commits", () => {
    const config = localMatch({
      mapId: "test",
      mapRevision: "test",
      seed: 1,
      slotCount: 2,
      me: 0,
      delay: 1,
    });
    const room = new Room(config);
    const ls0 = new Lockstep(new MemoryChannel(room, 0), 0, config.delay);
    const ls1 = new Lockstep(new MemoryChannel(room, 1), 1, config.delay);
    const a = kit(config.seed);
    const b = kit(config.seed);
    expect(a.checksum()).toBe(b.checksum());

    ls0.send({ type: "placeBuilding", kind: "lumberjack", at: { x: 20, y: 40 }, player: 0 });
    for (let t = 1; t <= 40; t++) {
      ls0.confirm(t);
      ls1.confirm(t);
      const commit = ls0.take(t);
      expect(commit).toBeDefined();
      apply(a, commit!);
      apply(b, commit!);
      a.tick();
      b.tick();
    }
    expect(a.checksum()).toBe(b.checksum());
    expect(a.buildings.at(20, 40)?.kind).toBe("lumberjack");
    expect(a.clock.tickIndex).toBe(40);
  });

  it("does not commit until every playing slot confirms through T", () => {
    const config = localMatch({
      mapId: "test",
      mapRevision: "test",
      seed: 1,
      slotCount: 2,
      me: 0,
      delay: 1,
    });
    const room = new Room(config);
    const ls0 = new Lockstep(new MemoryChannel(room, 0), 0, config.delay);
    new Lockstep(new MemoryChannel(room, 1), 1, config.delay);
    ls0.confirm(1);
    expect(ls0.take(1)).toBeUndefined();
  });

  it("does not resend an empty confirm for the same through", () => {
    let n = 0;
    const ch = {
      send: (): void => {
        n++;
      },
      onMessage: (): void => {},
    };
    const ls = new Lockstep(ch, 0, 1);
    ls.confirm(1);
    ls.confirm(1);
    expect(n).toBe(1);
    ls.send({ type: "placeBuilding", kind: "lumberjack", at: { x: 1, y: 1 }, player: 0 });
    ls.confirm(1);
    expect(n).toBe(2);
  });
});
