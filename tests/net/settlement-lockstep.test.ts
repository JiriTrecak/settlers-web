import { describe, it, expect } from "vitest";
import {
  localMatch,
  emptyUtcMap,
  type Commit,
  type Action,
} from "../../src/shared";
import { Room, Lockstep, MemoryChannel } from "../../src/net";
import { World } from "../../src/sim/world/world";
const map = emptyUtcMap();
const config = {
  ...localMatch({
    mapId: "test",
    mapRevision: "test",
    seed: 4,
    slotCount: 2,
    me: 0,
    delay: 3,
  }),
  slots: [
    { player: 0, kind: "human" as const },
    { player: 1, kind: "human" as const },
  ],
};
function apply(world: World, commit: Commit) {
  for (const slot of commit.slots)
    slot.actions.forEach((action, seq) =>
      world.enqueue(action, commit.tick, { player: slot.player, seq }),
    );
  world.tick();
}
describe("declarative lockstep integration", () => {
  it("drains an outbox at packet limits", () => {
    const room = new Room(config),
      a = new Lockstep(new MemoryChannel(room, 0), 0, 3),
      b = new Lockstep(new MemoryChannel(room, 1), 1, 3);
    for (let i = 0; i < 70; i++) a.send({ type: "ping" });
    let n = 0;
    for (let t = 1; t <= 4; t++) {
      a.confirm(t);
      b.confirm(t);
      n += a.take(t)!.slots[0]!.actions.length;
    }
    expect(n).toBe(70);
  });
  it("independent mailboxes agree through construction, recruitment and restored future commands", () => {
    const room = new Room(config),
      channels = [new MemoryChannel(room, 0), new MemoryChannel(room, 1)],
      peers = channels.map((c, i) => new Lockstep(c, i, 3)),
      worlds = [0, 1].map(
        () => new World({ map, slots: config.slots, seed: 4 }),
      );
    const actor = worlds[0]!.settlement!.entities.find(
      (e) => e.owner === "player.1" && e.definition === "unit.ants.settler",
    )!.id;
    peers[0]!.send({
      type: "build",
      actors: [actor],
      definition: "building.ants.barracks",
      position: { x: 205, y: 210 },
    });
    for (let tick = 1; tick <= 1600; tick++) {
      if (tick === 1000) {
        const b = worlds[0]!.settlement!.entities.find(
          (e) => e.definition === "building.ants.barracks",
        )!;
        peers[0]!.send({
          type: "produce",
          actor: b.id,
          definition: "unit.ants.warrior",
        });
      }
      peers[tick % 2]!.confirm(tick);
      peers[1 - (tick % 2)]!.confirm(tick);
      for (let i = 0; i < 2; i++) apply(worlds[i]!, peers[i]!.take(tick)!);
      if (tick === 1050) {
        const restored = new World({ map, slots: config.slots, seed: 4 });
        restored.restore(worlds[1]!.snapshot());
        worlds[1] = restored;
      }
      if (tick % 200 === 0)
        expect(worlds[0]!.checksum()).toBe(worlds[1]!.checksum());
    }
    expect(
      worlds[0]!.settlement!.entities.filter(
        (e) => e.owner === "player.1" && e.definition === "unit.ants.warrior",
      ),
    ).toHaveLength(3);
    channels.forEach((c) => c.destroy());
  }, 20000);
  it("rejects malformed batches atomically and ignores replayed confirmations", () => {
    const room = new Room(config),
      action: Action = {
        type: "build",
        actors: [2],
        definition: "building.ants.house",
        position: { x: 200, y: 210 },
      };
    room.confirm(0, 1, [
      { tick: 1, actions: [{ ...action, position: { x: NaN, y: 1 } }] },
    ]);
    room.confirm(1, 1, []);
    expect(room.tick).toBe(0);
    room.confirm(0, 1, [{ tick: 1, actions: [action] }]);
    expect(room.tick).toBe(1);
    room.confirm(0, 1, [{ tick: 2, actions: [action] }]);
    room.confirm(0, 2, []);
    room.confirm(1, 2, []);
    expect(room.snapshot().held).toEqual([]);
  });
  it("future AI intentions are enqueued and survive a world snapshot", () => {
    const opts = {
        map,
        seed: 8,
        slots: [
          { player: 0, kind: "human" as const },
          { player: 1, kind: "ai" as const },
        ],
      },
      a = new World(opts);
    for (let i = 0; i < 400 && a.snapshot().pending.length===0; i++) a.tick();
    expect(a.snapshot().pending.length).toBeGreaterThan(0);
    const b = new World(opts);
    b.restore(a.snapshot());
    for (let i = 0; i < 200; i++) {
      a.tick();
      b.tick();
    }
    expect(a.checksum()).toBe(b.checksum());
  });
  it("S21 resumes unapplied commits, room-held commands and the unsent client outbox together", () => {
    function harness() {
      const room = new Room(config),
        channels = [0, 1].map((p) => new MemoryChannel(room, p));
      return {
        room,
        channels,
        peers: channels.map((c, p) => new Lockstep(c, p, config.delay)),
        world: new World({ map, slots: config.slots, seed: 4 }),
      };
    }
    const uninterrupted = harness();
    for (let tick = 1; tick <= 4; tick++) {
      uninterrupted.peers.forEach((p) => p.confirm(tick));
      apply(uninterrupted.world, uninterrupted.peers[0]!.take(tick)!);
      uninterrupted.peers[1]!.take(tick);
    }
    const soldier = uninterrupted.world.settlement!.entities.find(
      (e) => e.owner === "player.1" && e.definition === "unit.ants.warrior",
    )!;
    uninterrupted.peers[0]!.send({
      type: "move",
      actors: [soldier.id],
      destination: { x: 220, y: 215 },
    });
    uninterrupted.peers[0]!.confirm(6);
    uninterrupted.peers[1]!.confirm(5);
    uninterrupted.peers[0]!.send({ type: "stop", actors: [soldier.id] });
    const snap = JSON.parse(
      JSON.stringify({
        world: uninterrupted.world.snapshot(),
        room: uninterrupted.room.snapshot(),
        peers: uninterrupted.peers.map((p) => ({
          commits: p.peek(),
          sent: p.sent(),
          pending: p.outbox(),
        })),
      }),
    );
    expect(snap.room.held).toHaveLength(1);
    expect(snap.peers[0].commits).toHaveLength(1);
    expect(snap.peers[0].pending).toHaveLength(1);
    const resumed = harness();
    resumed.world.restore(snap.world);
    resumed.room.resume(snap.room);
    resumed.peers.forEach((p, i) =>
      p.restore(
        snap.peers[i].commits,
        snap.peers[i].sent,
        snap.peers[i].pending,
      ),
    );
    const executed: string[] = [];
    for (let tick = 5; tick <= 80; tick++) {
      for (const h of [uninterrupted, resumed]) {
        h.peers.forEach((p) => p.confirm(tick));
        const commit = h.peers[0]!.take(tick)!;
        if (h === resumed)
          executed.push(
            ...commit.slots.flatMap((s) => s.actions.map((a) => a.type)),
          );
        apply(h.world, commit);
        h.peers[1]!.take(tick);
      }
      expect(resumed.world.checksum()).toBe(uninterrupted.world.checksum());
    }
    expect(executed).toEqual(["move", "stop"]);
    [...uninterrupted.channels, ...resumed.channels].forEach((c) =>
      c.destroy(),
    );
  });
});
