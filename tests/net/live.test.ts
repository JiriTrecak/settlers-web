/**
 * Live lockstep against MATCH_HOST. Same contract as Session.tick:
 * confirm(next) → wait for commit → enqueue → world.tick.
 * Spawns a room per test, kills it in afterEach.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import WS from "ws";
import {
  createRoom,
  endRoom,
  fetchHealth,
  fetchRoom,
  joinRoom,
  Lockstep,
  matchUrl,
  startRoom,
  WebSocketChannel,
  type Channel,
} from "../../src/net";
import type { Commit, MatchConfig, ServerMsg } from "../../src/shared";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { seedRng } from "../../src/sim/rng/rng";
import { World } from "../../src/sim/world/world";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WS as unknown as typeof WebSocket;
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** App waitStart: first listener, stays on the Channel after PlayScreen. */
function waitStart(channel: Channel): Promise<Extract<ServerMsg, { type: "start" }>> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("no start")), 10_000);
    channel.onMessage((msg) => {
      if (msg.type === "start") {
        clearTimeout(t);
        resolve(msg);
      }
      if (msg.type === "error") {
        clearTimeout(t);
        reject(new Error(msg.message));
      }
    });
  });
}

/** Session.bindRemote wrap — Lockstep is a second onMessage on the same Channel. */
function sessionLockstep(channel: Channel, player: number, delay: number): Lockstep {
  const wrapped: Channel = {
    send: (msg) => channel.send(msg),
    onMessage: (fn) => {
      channel.onMessage((msg) => {
        fn(msg);
      });
    },
  };
  return new Lockstep(wrapped, player, delay);
}

/**
 * Session.tick waiting on the wire: re-confirm every frame until take(next).
 * Throws if the mailbox never commits — this is the freeze.
 */
async function waitBeat(ls0: Lockstep, ls1: Lockstep, next: number, timeoutMs = 8_000): Promise<Commit> {
  const t0 = Date.now();
  let a: Commit | undefined;
  let b: Commit | undefined;
  const through = Math.max(next, ls0.delay);
  while (Date.now() - t0 < timeoutMs) {
    ls0.confirm(through, next + ls0.delay);
    ls1.confirm(through, next + ls1.delay);
    a ??= ls0.take(next);
    b ??= ls1.take(next);
    if (a && b) return a;
    await sleep(10);
  }
  throw new Error(`lockstep stalled at tick ${next} (p0=${a != null} p1=${b != null})`);
}

async function drive(a: World, b: World, ls0: Lockstep, ls1: Lockstep, ticks: number): Promise<void> {
  for (let n = 0; n < ticks; n++) {
    const next = a.clock.tickIndex + 1;
    const commit = await waitBeat(ls0, ls1, next);
    apply(a, commit);
    apply(b, commit);
    a.tick();
    b.tick();
  }
}

class LivePair {
  static open: LivePair[] = [];

  constructor(
    readonly id: string,
    readonly hostToken: string,
    readonly ch0: WebSocketChannel,
    readonly ch1: WebSocketChannel,
    readonly config: MatchConfig,
    readonly ls0: Lockstep,
    readonly ls1: Lockstep,
  ) {
    LivePair.open.push(this);
  }

  async kill(): Promise<void> {
    this.ch0.destroy();
    this.ch1.destroy();
    await endRoom(this.id, this.hostToken).catch(() => undefined);
    LivePair.open = LivePair.open.filter((p) => p !== this);
  }
}

async function openPair(): Promise<LivePair> {
  const created = await createRoom({
    name: `ut ${process.pid} ${Date.now()}`,
    mapId: "map",
    mapRevision: "map",
    slotCount: 2,
    guestName: "h",
  });
  const joined = await joinRoom(created.room.id, { guestName: "j", role: "player" });
  const ch0 = new WebSocketChannel(matchUrl(created.room.id, created.token));
  const ch1 = new WebSocketChannel(matchUrl(created.room.id, joined.token));
  const start0 = waitStart(ch0);
  const start1 = waitStart(ch1);
  await startRoom(created.room.id, created.token);
  const [s0, s1] = await Promise.all([start0, start1]);
  const config = s0.config;
  const ls0 = sessionLockstep(ch0, s0.you.player ?? 0, config.delay);
  const ls1 = sessionLockstep(ch1, s1.you.player ?? 1, config.delay);
  ch0.send({ type: "ready" });
  ch1.send({ type: "ready" });
  return new LivePair(created.room.id, created.token, ch0, ch1, config, ls0, ls1);
}

describe("live MatchHost", { timeout: 20_000 }, () => {
  beforeAll(async () => {
    const health = await fetchHealth();
    expect(health.ok).toBe(true);
  });

  afterEach(async () => {
    await Promise.all(LivePair.open.slice().map((p) => p.kill()));
  });

  it("two Worlds advance over WS; checksums match", async () => {
    const pair = await openPair();
    const a = kit(pair.config.seed);
    const b = kit(pair.config.seed);
    expect(a.checksum()).toBe(b.checksum());
    await drive(a, b, pair.ls0, pair.ls1, 40);
    expect(a.clock.tickIndex).toBe(40);
    expect(b.clock.tickIndex).toBe(40);
    expect(a.checksum()).toBe(b.checksum());
  });

  it("placeBuilding from slot 0 lands on both Worlds at tick+D", async () => {
    const pair = await openPair();
    const a = kit(pair.config.seed);
    const b = kit(pair.config.seed);
    pair.ls0.send({ type: "placeBuilding", kind: "lumberjack", at: { x: 20, y: 40 }, player: 0 });
    const delay = pair.config.delay;
    await drive(a, b, pair.ls0, pair.ls1, delay + 1);
    expect(a.buildings.at(20, 40)?.kind).toBe("lumberjack");
    expect(b.buildings.at(20, 40)?.kind).toBe("lumberjack");
    expect(a.checksum()).toBe(b.checksum());
  });

  it("endRoom drops the match from the lobby", async () => {
    const pair = await openPair();
    const id = pair.id;
    await pair.kill();
    await expect(fetchRoom(id)).rejects.toThrow(/not found/i);
  });

  it("a slot that only confirms (no take) does not freeze the other World", async () => {
    const pair = await openPair();
    const a = kit(pair.config.seed);
    const through = 40;
    const t0 = Date.now();
    while (a.clock.tickIndex < through) {
      if (Date.now() - t0 > 8_000) throw new Error(`stalled at ${a.clock.tickIndex}`);
      pair.ls0.confirm(through);
      pair.ls1.confirm(through);
      const next = a.clock.tickIndex + 1;
      const commit = pair.ls0.take(next);
      if (commit) {
        apply(a, commit);
        a.tick();
      } else await sleep(10);
    }
    expect(a.clock.tickIndex).toBe(through);
  });
});
