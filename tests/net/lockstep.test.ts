/** N Worlds, one Room: same commits ⇒ same checksum. Stall without every slot's confirm. */
import { describe, expect, it } from "vitest";
import {
  localMatch,
  emptyUtcMap,
  type ClientMsg,
  type Commit,
} from "../../src/shared";
import { Lockstep, MemoryChannel, Room } from "../../src/net";
import { World } from "../../src/sim/world/world";

function kit(seed: number, slotCount: number): World {
  const config = localMatch({
    mapId: "test",
    mapRevision: "test",
    seed,
    slotCount,
    me: 0,
    delay: 1,
  });
  const blank = emptyUtcMap(),
    map = {
      ...blank,
      playerStarts: config.slots.map((s, i) => ({
        player: s.player + 1,
        x: i === 0 ? 218 : 38,
        z: i === 1 ? 38 : 218,
        setup: "setup.ants",
        mainFort: `start.player.${s.player + 1}/main-fort`,
      })),
    };
  return new World({ map, slots: config.slots, seed });
}

function apply(world: World, commit: Commit): void {
  for (const slot of commit.slots) {
    for (let i = 0; i < slot.actions.length; i++) {
      world.enqueue(slot.actions[i]!, commit.tick, {
        player: slot.player,
        seq: i,
      });
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
    const a = kit(config.seed, 2);
    const b = kit(config.seed, 2);
    expect(a.checksum()).toBe(b.checksum());
    expect(a.slots).toHaveLength(2);
    expect(b.slots).toHaveLength(2);

    ls0.send({ type: "ping" });
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
    ls.send({ type: "ping" });
    ls.confirm(100, 50);
    expect(sent).toEqual({
      type: "turn",
      through: 101,
      bundles: [{ tick: 101, actions: [{ type: "ping" }] }],
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
    ls.send({ type: "ping" });
    ls.confirm(1);
    expect(n).toBe(2);
  });

  it("drops noop so it never hits the Room", () => {
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
    ls0.send({ type: "noop" });
    ls0.send({ type: "ping" });
    ls0.confirm(1, 1);
    ls1.confirm(1, 1);
    const commit = ls0.take(1)!;
    expect(commit.slots[0]!.actions.map((a) => a.type)).toEqual(["ping"]);
    expect(commit.slots[1]!.actions).toEqual([]);
  });

  it("restore clears pending and reseeds peek/take", () => {
    const ch = {
      send: (): void => {},
      onMessage: (): void => {},
    };
    const ls = new Lockstep(ch, 0, 1);
    ls.send({ type: "ping" });
    const saved: Commit = {
      tick: 4,
      slots: [
        { player: 0, actions: [{ type: "ping" }] },
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
        if (msg.type === "turn")
          sent = { through: msg.through, bundles: msg.bundles };
      },
      onMessage: (): void => {},
    };
    const ls2 = new Lockstep(ch2, 0, 1);
    ls2.send({ type: "ping" });
    ls2.restore([], 5);
    ls2.confirm(6);
    expect(sent).toEqual({ through: 6, bundles: [] });
  });

  it("same-tick clicks from both slots land player-sorted in the commit", () => {
    const config = localMatch({
      mapId: "test",
      mapRevision: "test",
      seed: 1,
      slotCount: 2,
      me: 0,
      delay: 1,
    });
    const room = new Room({
      ...config,
      slots: [
        { player: 1, kind: "human" },
        { player: 0, kind: "human" },
      ],
    });
    const ls0 = new Lockstep(new MemoryChannel(room, 0), 0, config.delay);
    const ls1 = new Lockstep(new MemoryChannel(room, 1), 1, config.delay);
    ls1.send({ type: "ping" });
    ls0.send({ type: "ping" });
    ls1.confirm(1, 1);
    ls0.confirm(1, 1);
    const commit = ls0.take(1)!;
    expect(commit.slots.map((s) => s.player)).toEqual([0, 1]);
    const a = kit(config.seed, 2);
    apply(a, commit);
    a.tick();
    const players = a
      .log()
      .filter((e) => e.tick === 1 && e.action.type === "ping")
      .map((e) => e.player);
    expect(players).toEqual([0, 1]);
  });

  it("three worlds on one Room share checksums after the same commits", () => {
    const config = localMatch({
      mapId: "test",
      mapRevision: "test",
      seed: 1,
      slotCount: 3,
      me: 0,
      delay: 1,
    });
    const room = new Room(config);
    const ls0 = new Lockstep(new MemoryChannel(room, 0), 0, config.delay);
    const ls1 = new Lockstep(new MemoryChannel(room, 1), 1, config.delay);
    const ls2 = new Lockstep(new MemoryChannel(room, 2), 2, config.delay);
    const worlds = [
      kit(config.seed, 3),
      kit(config.seed, 3),
      kit(config.seed, 3),
    ];
    expect(worlds[0]!.checksum()).toBe(worlds[1]!.checksum());
    expect(worlds[1]!.checksum()).toBe(worlds[2]!.checksum());
    ls0.send({ type: "ping" });
    ls2.send({ type: "ping" });
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
    expect(worlds[0]!.slots).toHaveLength(3);
  });
});

describe("Room mailbox", () => {
  it("resume does not re-emit already-committed ticks", () => {
    const config = localMatch({
      mapId: "test",
      mapRevision: "test",
      seed: 1,
      slotCount: 2,
      me: 0,
      delay: 1,
    });
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
    const config = localMatch({
      mapId: "test",
      mapRevision: "test",
      seed: 1,
      slotCount: 2,
      me: 0,
      delay: 8,
    });
    const room = new Room(config);
    const action = { type: "ping" as const };
    room.confirm(0, 5, [{ tick: 8, actions: [action] }]);
    room.confirm(1, 5, []);
    expect(room.tick).toBe(5);
    expect(room.snapshot().held).toEqual([
      { player: 0, tick: 8, actions: [action] },
    ]);
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
    const config = localMatch({
      mapId: "test",
      mapRevision: "test",
      seed: 1,
      slotCount: 2,
      me: 0,
      delay: 1,
    });
    const room = new Room(config);
    room.confirm(0, 2, []);
    room.confirm(1, 2, []);
    const ticks: number[] = [];
    room.subscribe((m) => {
      if (m.type === "commit") ticks.push(m.tick);
    });
    room.confirm(0, 3, [{ tick: 2, actions: [{ type: "ping" }] }]);
    room.confirm(1, 3, []);
    expect(ticks).toEqual([3]);
    expect(room.tick).toBe(3);
  });
});
