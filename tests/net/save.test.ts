/** Save/load lockstep pipeline: unapplied D-ahead commits survive. */
import { describe, expect, it } from "vitest";
import { localMatch, type Commit, type ServerMsg } from "../../src/shared";
import { Lockstep, MemoryChannel, Room } from "../../src/net";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { World } from "../../src/sim/world/world";
import { seedRng } from "../../src/sim/rng/rng";
import { capturePipeline, makeSaveFile, parseSaveFile, restorePipeline, restoreWorld } from "../../src/session/save/save";
import { MatchHost } from "../../src/net/host";

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

function cfg(delay: number) {
  return localMatch({ mapId: "test", mapRevision: "test", seed: 1, slotCount: 2, me: 0, delay });
}

describe("save pipeline", () => {
  it("SP D=1: load and continue matches the unsaved twin", () => {
    const config = cfg(1);
    const room = new Room(config);
    const ls0 = new Lockstep(new MemoryChannel(room, 0), 0, config.delay);
    const ls1 = new Lockstep(new MemoryChannel(room, 1), 1, config.delay);
    const a = kit(config.seed);
    const twin = kit(config.seed);
    ls0.send({ type: "placeBuilding", kind: "lumberjack", at: { x: 20, y: 40 }, player: 0 });
    for (let t = 1; t <= 20; t++) {
      ls0.confirm(t);
      ls1.confirm(t);
      const commit = ls0.take(t)!;
      apply(a, commit);
      apply(twin, commit);
      a.tick();
      twin.tick();
    }
    const file = makeSaveFile({
      name: "mid",
      mapName: "T",
      me: 0,
      remote: false,
      match: config,
      world: a,
      pipeline: capturePipeline(room, ls0),
    });
    const round = parseSaveFile(JSON.parse(JSON.stringify(file)))!;
    const loaded = restoreWorld(round)!;
    const room2 = new Room(round.match);
    const l0 = new Lockstep(new MemoryChannel(room2, 0), 0, round.match.delay);
    const l1 = new Lockstep(new MemoryChannel(room2, 1), 1, round.match.delay);
    restorePipeline(room2, l0, round.pipeline);
    l1.restore(round.pipeline.commits, round.pipeline.sentThrough);

    for (let t = loaded.clock.tickIndex + 1; t <= 60; t++) {
      l0.confirm(t);
      l1.confirm(t);
      ls0.confirm(t);
      ls1.confirm(t);
      const c1 = l0.take(t)!;
      const c2 = ls0.take(t)!;
      apply(loaded, c1);
      apply(twin, c2);
      loaded.tick();
      twin.tick();
    }
    expect(loaded.checksum()).toBe(twin.checksum());
    expect(loaded.buildings.at(20, 40)?.kind).toBe("lumberjack");
  });

  it("MP D=8: a click still in the pipeline lands after load", () => {
    const config = cfg(8);
    const room = new Room(config);
    const ls0 = new Lockstep(new MemoryChannel(room, 0), 0, config.delay);
    const ls1 = new Lockstep(new MemoryChannel(room, 1), 1, config.delay);
    const a = kit(config.seed);
    const twin = kit(config.seed);

    const pump = (through: number, next: number): void => {
      ls0.confirm(through, next + config.delay);
      ls1.confirm(through, next + config.delay);
      const commit = ls0.take(next);
      if (!commit) return;
      apply(a, commit);
      apply(twin, commit);
      a.tick();
      twin.tick();
    };

    for (let t = 1; t <= 10; t++) pump(t + config.delay, t);
    expect(a.clock.tickIndex).toBe(10);

    ls0.send({ type: "placeBuilding", kind: "lumberjack", at: { x: 20, y: 40 }, player: 0 });
    pump(10 + config.delay, 11);
    expect(a.buildings.at(20, 40)).toBeUndefined();
    expect(ls0.peek().length).toBeGreaterThan(0);

    const file = makeSaveFile({
      name: "pipe",
      mapName: "T",
      me: 0,
      remote: true,
      match: config,
      world: a,
      pipeline: capturePipeline(room, ls0),
    });
    const round = parseSaveFile(JSON.parse(JSON.stringify(file)))!;
    expect(round.pipeline.commits.length).toBeGreaterThan(0);
    const loaded = restoreWorld(round)!;
    const room2 = new Room(round.match);
    const l0 = new Lockstep(new MemoryChannel(room2, 0), 0, round.match.delay);
    const l1 = new Lockstep(new MemoryChannel(room2, 1), 1, round.match.delay);
    restorePipeline(room2, l0, round.pipeline);
    l1.restore(round.pipeline.commits, round.pipeline.sentThrough);

    while (loaded.clock.tickIndex < 11 + config.delay) {
      const next = loaded.clock.tickIndex + 1;
      const through = next + config.delay;
      l0.confirm(through, next + config.delay);
      l1.confirm(through, next + config.delay);
      ls0.confirm(through, next + config.delay);
      ls1.confirm(through, next + config.delay);
      const c1 = l0.take(next);
      const c2 = ls0.take(next);
      if (!c1 || !c2) break;
      apply(loaded, c1);
      apply(twin, c2);
      loaded.tick();
      twin.tick();
    }
    expect(loaded.buildings.at(20, 40)?.kind).toBe("lumberjack");
    expect(twin.buildings.at(20, 40)?.kind).toBe("lumberjack");
    expect(loaded.checksum()).toBe(twin.checksum());
  });
});

describe("MatchHost load", () => {
  it("host load from lobby fans start+save and resumes mailbox", () => {
    const host = new MatchHost();
    const created = host.create({
      name: "r",
      mapId: "test",
      mapRevision: "test",
      slotCount: 2,
      guestName: "Ada",
    });
    const room = host.get(created.room.id)!;
    const joined = room.join("Bob", "player") as { token: string };
    const a: { type: string }[] = [];
    const b: { type: string }[] = [];
    room.bind(created.token, (m) => a.push(m));
    room.bind(joined.token, (m) => b.push(m));

    const world = kit(1);
    for (let i = 0; i < 12; i++) world.tick();
    const config = localMatch({
      mapId: "test",
      mapRevision: "test",
      seed: 1,
      slotCount: 2,
      me: 0,
      delay: 8,
    });
    config.slots[0]!.name = "Ada";
    config.slots[1]!.name = "Bob";
    const file = makeSaveFile({
      name: "host",
      mapName: "T",
      me: 0,
      remote: true,
      match: config,
      world,
    });
    expect(room.load(created.token, file)).toMatchObject({ config: { mapId: "test", roomId: created.room.id } });
    const start = a.find((m) => m.type === "start") as { type: string; save?: unknown } | undefined;
    expect(start?.save).toBeTruthy();
    expect(a.some((m) => m.type === "start")).toBe(true);
    expect(b.some((m) => m.type === "start")).toBe(true);
    expect(room.view().tick).toBe(12);
  });

  it("overlays current lobby names and keeps historical names on the file", () => {
    const host = new MatchHost();
    const created = host.create({
      name: "r",
      mapId: "test",
      mapRevision: "test",
      slotCount: 2,
      guestName: "Ada",
    });
    const room = host.get(created.room.id)!;
    room.join("Bob", "player");
    const a: ServerMsg[] = [];
    room.bind(created.token, (m) => a.push(m));
    const world = kit(1);
    const config = cfg(8);
    config.slots[0]!.name = "OldA";
    config.slots[1]!.name = "OldB";
    const file = makeSaveFile({ name: "n", mapName: "T", me: 0, remote: true, match: config, world });
    const out = room.load(created.token, file);
    expect(out).toMatchObject({ config: { slots: [{ name: "Ada" }, { name: "Bob" }] } });
    expect(file.match.slots.map((s) => s.name)).toEqual(["OldA", "OldB"]);
    const start = a.find((m) => m.type === "start");
    expect(start?.type === "start" && start.config.slots.map((s) => s.name)).toEqual(["Ada", "Bob"]);
  });

  it("live load fans load, not start", () => {
    const host = new MatchHost();
    const created = host.create({
      name: "r",
      mapId: "test",
      mapRevision: "test",
      slotCount: 2,
      guestName: "Ada",
    });
    const room = host.get(created.room.id)!;
    const joined = room.join("Bob", "player") as { token: string };
    const a: ServerMsg[] = [];
    const b: ServerMsg[] = [];
    room.bind(created.token, (m) => a.push(m));
    room.bind(joined.token, (m) => b.push(m));
    room.start(created.token);
    a.length = 0;
    b.length = 0;
    const world = kit(1);
    for (let i = 0; i < 20; i++) world.tick();
    const file = makeSaveFile({ name: "live", mapName: "T", me: 0, remote: true, match: cfg(8), world });
    expect(room.load(created.token, file)).toMatchObject({ config: { mapId: "test" } });
    expect(a.some((m) => m.type === "load")).toBe(true);
    expect(b.some((m) => m.type === "load")).toBe(true);
    expect(a.some((m) => m.type === "start")).toBe(false);
    expect(room.view().tick).toBe(20);
  });

  it("late spectator bind gets start+save", () => {
    const host = new MatchHost();
    const created = host.create({
      name: "r",
      mapId: "test",
      mapRevision: "test",
      slotCount: 2,
      guestName: "Ada",
    });
    const room = host.get(created.room.id)!;
    room.join("Bob", "player");
    const world = kit(1);
    for (let i = 0; i < 8; i++) world.tick();
    const file = makeSaveFile({ name: "spec", mapName: "T", me: 0, remote: true, match: cfg(8), world });
    room.load(created.token, file);
    const spec = room.join("Eve", "spectator") as { token: string; you: { role: string } };
    expect(spec.you.role).toBe("spectator");
    const s: ServerMsg[] = [];
    room.bind(spec.token, (m) => s.push(m));
    expect(s.some((m) => m.type === "start" && m.save != null)).toBe(true);
  });

  it("host restart fans a new seed and rejects a foreign restart", () => {
    const host = new MatchHost();
    const created = host.create({
      name: "r",
      mapId: "test",
      mapRevision: "test",
      slotCount: 2,
      guestName: "Ada",
    });
    const room = host.get(created.room.id)!;
    const joined = room.join("Bob", "player") as { token: string };
    const a: ServerMsg[] = [];
    room.bind(created.token, (m) => a.push(m));
    room.bind(joined.token, () => {});
    const started = room.start(created.token);
    expect("config" in started).toBe(true);
    const seed = "config" in started ? started.config.seed : 0;
    a.length = 0;
    room.ingest(joined.token, { type: "restart" });
    expect(a.some((m) => m.type === "restart")).toBe(false);
    expect(room.restart(created.token)).toMatchObject({ config: { mapId: "test" } });
    const msg = a.find((m) => m.type === "restart");
    expect(msg?.type === "restart" && msg.config.seed).not.toBe(seed);
    expect(room.view().tick).toBe(0);
  });

  it("rejects a foreign loadSave", () => {
    const host = new MatchHost();
    const created = host.create({
      name: "r",
      mapId: "test",
      mapRevision: "test",
      slotCount: 2,
      guestName: "Ada",
    });
    const room = host.get(created.room.id)!;
    const joined = room.join("Bob", "player") as { token: string };
    room.bind(created.token, () => {});
    room.bind(joined.token, () => {});
    const world = kit(1);
    const file = makeSaveFile({
      name: "x",
      mapName: "T",
      me: 0,
      remote: true,
      match: cfg(8),
      world,
    });
    room.ingest(joined.token, { type: "loadSave", save: file });
    expect(room.view().state).toBe("waiting");
  });

  it("load from a guest is not_host", () => {
    const host = new MatchHost();
    const created = host.create({
      name: "r",
      mapId: "test",
      mapRevision: "test",
      slotCount: 2,
      guestName: "Ada",
    });
    const room = host.get(created.room.id)!;
    const joined = room.join("Bob", "player") as { token: string };
    const world = kit(1);
    const file = makeSaveFile({ name: "x", mapName: "T", me: 0, remote: true, match: cfg(8), world });
    expect(room.load(joined.token, file)).toEqual({ error: "not_host" });
    expect(room.view().state).toBe("waiting");
  });

  it("rejects lobby load when seated count ≠ save slots", () => {
    const host = new MatchHost();
    const created = host.create({
      name: "r",
      mapId: "test",
      mapRevision: "test",
      slotCount: 2,
      guestName: "Ada",
    });
    const room = host.get(created.room.id)!;
    const world = kit(1);
    const file = makeSaveFile({ name: "x", mapName: "T", me: 0, remote: true, match: cfg(8), world });
    expect(room.load(created.token, file)).toEqual({ error: "slots" });
    expect(room.view().state).toBe("waiting");
  });

  it("rejects a singleplayer save in a multiplayer room", () => {
    const host = new MatchHost();
    const created = host.create({
      name: "r",
      mapId: "test",
      mapRevision: "test",
      slotCount: 2,
      guestName: "Ada",
    });
    const room = host.get(created.room.id)!;
    room.join("Bob", "player");
    const world = kit(1);
    const file = makeSaveFile({ name: "sp", mapName: "T", me: 0, remote: false, match: cfg(1), world });
    expect(room.load(created.token, file)).toEqual({ error: "sp_save" });
    expect(room.view().state).toBe("waiting");
  });

  it("host ingest loadSave from lobby fans start+save", () => {
    const host = new MatchHost();
    const created = host.create({
      name: "r",
      mapId: "test",
      mapRevision: "test",
      slotCount: 2,
      guestName: "Ada",
    });
    const room = host.get(created.room.id)!;
    const joined = room.join("Bob", "player") as { token: string };
    const a: ServerMsg[] = [];
    room.bind(created.token, (m) => a.push(m));
    room.bind(joined.token, () => {});
    const world = kit(1);
    for (let i = 0; i < 12; i++) world.tick();
    const file = makeSaveFile({ name: "wire", mapName: "T", me: 0, remote: true, match: cfg(8), world });
    room.ingest(created.token, { type: "loadSave", save: file });
    expect(a.some((m) => m.type === "start" && m.save != null)).toBe(true);
    expect(room.view().state).toBe("playing");
    expect(room.view().tick).toBe(12);
  });

  it("after load, ready fans go at committed+1", () => {
    const host = new MatchHost();
    const created = host.create({
      name: "r",
      mapId: "test",
      mapRevision: "test",
      slotCount: 2,
      guestName: "Ada",
    });
    const room = host.get(created.room.id)!;
    const joined = room.join("Bob", "player") as { token: string };
    const a: ServerMsg[] = [];
    room.bind(created.token, (m) => a.push(m));
    room.bind(joined.token, () => {});
    const world = kit(1);
    for (let i = 0; i < 12; i++) world.tick();
    const file = makeSaveFile({ name: "go", mapName: "T", me: 0, remote: true, match: cfg(8), world });
    expect(room.load(created.token, file)).toMatchObject({ config: { mapId: "test" } });
    a.length = 0;
    room.ingest(created.token, { type: "ready" });
    expect(a.some((m) => m.type === "go")).toBe(false);
    room.ingest(joined.token, { type: "ready" });
    const go = a.find((m) => m.type === "go");
    expect(go).toMatchObject({ type: "go", tick: 13 });
  });
});
