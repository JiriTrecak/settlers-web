/** N Worlds, one Room: same commits ⇒ same checksum. Stall without every slot's confirm. Resume keeps held bundles. */
import { describe, expect, it } from "vitest";
import { localMatch, type ClientMsg, type Commit } from "../../src/shared";
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

function kit3(seed: number): World {
  const world = new World(grass(200, 200), undefined, seedRng(seed));
  world.dispatch({ type: "placeColony", at: { x: 24, y: 24 }, player: 0 });
  world.dispatch({ type: "placeColony", at: { x: 160, y: 24 }, player: 1 });
  world.dispatch({ type: "placeColony", at: { x: 24, y: 160 }, player: 2 });
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

  it("clamps a late click to sentThrough+1, not through+D", () => {
    let sent: ClientMsg | undefined;
    const ch = {
      send: (msg: ClientMsg): void => {
        if (msg.type === "turn") sent = msg;
      },
      onMessage: (): void => {},
    };
    const ls = new Lockstep(ch, 0, 8);
    ls.confirm(100);
    ls.send({ type: "placeBuilding", kind: "lumberjack", at: { x: 1, y: 1 }, player: 0 });
    ls.confirm(100, 50);
    expect(sent).toEqual({
      type: "turn",
      through: 101,
      bundles: [{ tick: 101, actions: [{ type: "placeBuilding", kind: "lumberjack", at: { x: 1, y: 1 }, player: 0 }] }],
    });
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

  it("drops placeColony and noop so they never hit the Room", () => {
    const config = localMatch({ mapId: "test", mapRevision: "test", seed: 1, slotCount: 2, me: 0, delay: 1 });
    const room = new Room(config);
    const ls0 = new Lockstep(new MemoryChannel(room, 0), 0, config.delay);
    const ls1 = new Lockstep(new MemoryChannel(room, 1), 1, config.delay);
    ls0.send({ type: "noop" });
    ls0.send({ type: "placeColony", at: { x: 8, y: 8 }, player: 0 });
    ls0.send({ type: "placeBuilding", kind: "lumberjack", at: { x: 20, y: 40 }, player: 0 });
    ls0.confirm(1, 1);
    ls1.confirm(1, 1);
    const commit = ls0.take(1)!;
    expect(commit.slots[0]!.actions.map((a) => a.type)).toEqual(["placeBuilding"]);
    expect(commit.slots[1]!.actions).toEqual([]);
  });

  it("restore clears pending and reseeds peek/take", () => {
    const ch = {
      send: (): void => {},
      onMessage: (): void => {},
    };
    const ls = new Lockstep(ch, 0, 1);
    ls.send({ type: "placeBuilding", kind: "lumberjack", at: { x: 1, y: 1 }, player: 0 });
    const saved: Commit = {
      tick: 4,
      slots: [
        { player: 0, actions: [{ type: "placeBuilding", kind: "stonecutter", at: { x: 2, y: 2 }, player: 0 }] },
        { player: 1, actions: [] },
      ],
    };
    ls.restore([saved], 9);
    expect(ls.sent()).toBe(9);
    expect(ls.peek()).toEqual([saved]);
    expect(ls.take(4)).toEqual(saved);
    expect(ls.take(4)).toBeUndefined();
    expect(ls.peek()).toEqual([]);
    let sent: { through: number; bundles: unknown[] } | undefined;
    const ch2 = {
      send: (msg: ClientMsg): void => {
        if (msg.type === "turn") sent = { through: msg.through, bundles: msg.bundles };
      },
      onMessage: (): void => {},
    };
    const ls2 = new Lockstep(ch2, 0, 1);
    ls2.send({ type: "placeBuilding", kind: "lumberjack", at: { x: 1, y: 1 }, player: 0 });
    ls2.restore([], 5);
    ls2.confirm(6);
    expect(sent).toEqual({ through: 6, bundles: [] });
  });

  it("same-tick clicks from both slots land player-sorted in the commit", () => {
    const config = localMatch({ mapId: "test", mapRevision: "test", seed: 1, slotCount: 2, me: 0, delay: 1 });
    const room = new Room({
      ...config,
      slots: [
        { player: 1, kind: "human" },
        { player: 0, kind: "human" },
      ],
    });
    const ls0 = new Lockstep(new MemoryChannel(room, 0), 0, config.delay);
    const ls1 = new Lockstep(new MemoryChannel(room, 1), 1, config.delay);
    ls1.send({ type: "placeBuilding", kind: "lumberjack", at: { x: 20, y: 40 }, player: 1 });
    ls0.send({ type: "placeBuilding", kind: "stonecutter", at: { x: 22, y: 40 }, player: 0 });
    ls1.confirm(1, 1);
    ls0.confirm(1, 1);
    const commit = ls0.take(1)!;
    expect(commit.slots.map((s) => s.player)).toEqual([0, 1]);
    expect(commit.slots[0]!.actions[0]).toMatchObject({ type: "placeBuilding", kind: "stonecutter" });
    expect(commit.slots[1]!.actions[0]).toMatchObject({ type: "placeBuilding", kind: "lumberjack" });
    const a = kit(config.seed);
    apply(a, commit);
    a.tick();
    const kinds = a
      .log()
      .filter((e) => e.tick === 1 && e.action.type === "placeBuilding")
      .map((e) => (e.action.type === "placeBuilding" ? e.action.kind : ""));
    expect(kinds).toEqual(["stonecutter", "lumberjack"]);
  });

  it("three worlds on one Room share checksums after the same commits", () => {
    const config = localMatch({ mapId: "test", mapRevision: "test", seed: 1, slotCount: 3, me: 0, delay: 1 });
    const room = new Room(config);
    const ls0 = new Lockstep(new MemoryChannel(room, 0), 0, config.delay);
    const ls1 = new Lockstep(new MemoryChannel(room, 1), 1, config.delay);
    const ls2 = new Lockstep(new MemoryChannel(room, 2), 2, config.delay);
    const worlds = [kit3(config.seed), kit3(config.seed), kit3(config.seed)];
    expect(worlds[0]!.checksum()).toBe(worlds[1]!.checksum());
    expect(worlds[1]!.checksum()).toBe(worlds[2]!.checksum());
    ls0.send({ type: "setDiggerRatio", ratio: 0.5, player: 0 });
    ls2.send({ type: "setBricklayerRatio", ratio: 0.5, player: 2 });
    for (let t = 1; t <= 20; t++) {
      ls0.confirm(t);
      ls1.confirm(t);
      ls2.confirm(t);
      const commit = ls0.take(t);
      expect(commit).toBeDefined();
      expect(commit!.slots.map((s) => s.player)).toEqual([0, 1, 2]);
      for (const w of worlds) {
        apply(w, commit!);
        w.tick();
      }
    }
    expect(worlds[0]!.checksum()).toBe(worlds[1]!.checksum());
    expect(worlds[1]!.checksum()).toBe(worlds[2]!.checksum());
    expect(worlds[0]!.diggerRatio(0)).toBe(0.5);
    expect(worlds[0]!.bricklayerRatio(2)).toBe(0.5);
    expect(worlds[0]!.diggerRatio(1)).toBe(worlds[0]!.diggerRatio(2));
  });
});

describe("Room mailbox", () => {
  it("resume does not re-emit already-committed ticks", () => {
    const config = localMatch({ mapId: "test", mapRevision: "test", seed: 1, slotCount: 2, me: 0, delay: 1 });
    const room = new Room(config);
    room.confirm(0, 5, []);
    room.confirm(1, 5, []);
    expect(room.tick).toBe(5);
    const snap = room.snapshot();
    const next = new Room(config);
    const ticks: number[] = [];
    next.subscribe((m) => {
      if (m.type === "commit") ticks.push(m.tick);
    });
    next.resume(snap);
    expect(ticks).toEqual([]);
    expect(next.tick).toBe(5);
    next.confirm(0, 6, []);
    next.confirm(1, 6, []);
    expect(ticks).toEqual([6]);
    expect(next.tick).toBe(6);
  });

  it("held bundles past committed survive resume and land later", () => {
    const config = localMatch({ mapId: "test", mapRevision: "test", seed: 1, slotCount: 2, me: 0, delay: 8 });
    const room = new Room(config);
    const action = { type: "placeBuilding" as const, kind: "lumberjack" as const, at: { x: 20, y: 40 }, player: 0 };
    room.confirm(0, 5, [{ tick: 8, actions: [action] }]);
    room.confirm(1, 5, []);
    expect(room.tick).toBe(5);
    expect(room.snapshot().held).toEqual([{ player: 0, tick: 8, actions: [action] }]);
    const next = new Room(config);
    const commits: Commit[] = [];
    next.subscribe((m) => {
      if (m.type === "commit") commits.push(m);
    });
    next.resume(room.snapshot());
    next.confirm(0, 8, []);
    next.confirm(1, 8, []);
    expect(commits.map((c) => c.tick)).toEqual([6, 7, 8]);
    expect(commits[2]!.slots[0]!.actions).toEqual([action]);
    expect(commits[2]!.slots[1]!.actions).toEqual([]);
  });

  it("drops a bundle whose tick is already committed", () => {
    const config = localMatch({ mapId: "test", mapRevision: "test", seed: 1, slotCount: 2, me: 0, delay: 1 });
    const room = new Room(config);
    room.confirm(0, 2, []);
    room.confirm(1, 2, []);
    const ticks: number[] = [];
    room.subscribe((m) => {
      if (m.type === "commit") ticks.push(m.tick);
    });
    room.confirm(0, 3, [{ tick: 2, actions: [{ type: "placeBuilding", kind: "lumberjack", at: { x: 1, y: 1 }, player: 0 }] }]);
    room.confirm(1, 3, []);
    expect(ticks).toEqual([3]);
    expect(room.tick).toBe(3);
  });
});
