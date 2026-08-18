/** Replay log + duration: same mix at tick N, including beats after the last action. */
import { describe, expect, it } from "vitest";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { ObjectGrid } from "../../src/sim/object/object";
import { World } from "../../src/sim/world/world";
import {
  DEFAULT_WORLD_SEED,
  makeReplayFile,
  parseReplayFile,
  replayPlayers,
  replayResult,
} from "../../src/session/replay/replay";
import { ReplayStore } from "../../src/session/replay/store";
import { seedRng } from "../../src/sim/rng/rng";

function grass(w: number, h: number): MapGrid {
  const grid = new MapGrid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid.setLandscape(x, y, "grass");
  }
  return grid;
}

function kit(): World {
  return new World(grass(64, 64), undefined, seedRng(DEFAULT_WORLD_SEED));
}

describe("world replay untilTick", () => {
  it("ticks past the last action to the recorded duration", () => {
    const a = kit();
    a.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
    a.enqueue({ type: "placeBuilding", kind: "lumberjack", at: { x: 20, y: 40 }, player: 0 }, 20);
    for (let i = 0; i < 80; i++) a.tick();

    const b = kit();
    b.replay(a.log(), a.clock.tickIndex);
    expect(b.clock.tickIndex).toBe(a.clock.tickIndex);
    expect(b.checksum()).toBe(a.checksum());
  });

  it("mid-seek checksum matches a world that only ran that far", () => {
    const a = kit();
    a.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
    a.enqueue({ type: "placeBuilding", kind: "lumberjack", at: { x: 20, y: 40 }, player: 0 }, 20);
    for (let i = 0; i < 80; i++) a.tick();
    const mid = kit();
    mid.replay(a.log(), 40);
    const only = kit();
    only.replay(a.log(), 40);
    expect(mid.checksum()).toBe(only.checksum());
    expect(mid.clock.tickIndex).toBe(40);

    const fromClone = new World(grass(64, 64).clone(), undefined, seedRng(DEFAULT_WORLD_SEED));
    fromClone.replay(a.log(), 40);
    expect(fromClone.checksum()).toBe(mid.checksum());
  });

  it("records a file on HQ destroy whose parse+replay matches", () => {
    const a = kit();
    a.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
    a.enqueue({ type: "destroyBuilding", at: { x: 32, y: 32 } });
    let n = 0;
    while (a.outcome == null && n++ < 8) a.tick();
    expect(a.outcome).not.toBeNull();
    const file = makeReplayFile({ mapId: "test", mapName: "Test", seed: DEFAULT_WORLD_SEED, me: 0, world: a });
    expect(file).not.toBeNull();
    expect(file.players).toEqual([0]);
    expect(replayResult(file!)).toBe("defeat");
    const round = parseReplayFile(JSON.parse(JSON.stringify(file)));
    expect(round).not.toBeNull();
    const b = kit();
    b.replay(round!.log, round!.duration);
    expect(b.checksum()).toBe(file!.checksum);
    expect(b.outcome).toEqual(a.outcome);
  });

  it("snapshots an in-progress match as saved", () => {
    const a = kit();
    a.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
    for (let i = 0; i < 40; i++) a.tick();
    const file = makeReplayFile({ mapId: "test", mapName: "Test", seed: DEFAULT_WORLD_SEED, me: 0, world: a });
    expect(file.outcome).toEqual({ winner: null, defeated: [] });
    expect(replayResult(file)).toBe("saved");
    const b = kit();
    b.replay(file.log, file.duration);
    expect(b.checksum()).toBe(file.checksum);
    expect(b.outcome).toBeNull();
  });

  it("lists every slot from the log, including old files without players", () => {
    const file = {
      v: 1 as const,
      id: "x",
      savedAt: 1,
      mapId: "m",
      mapName: "M",
      seed: 1,
      me: 0,
      duration: 10,
      checksum: 1,
      outcome: { winner: 0, defeated: [1] },
      log: [
        { tick: 0, player: 0, action: { type: "placeColony" as const, at: { x: 8, y: 8 }, player: 0 } },
        { tick: 0, player: 1, action: { type: "placeColony" as const, at: { x: 40, y: 40 }, player: 1 } },
      ],
    };
    expect(replayPlayers(file)).toEqual([0, 1]);
    const round = parseReplayFile(JSON.parse(JSON.stringify({ ...file, players: [0, 1] })));
    expect(round?.players).toEqual([0, 1]);
    const { players: _drop, ...legacy } = { ...file, players: [0, 1] };
    expect(replayPlayers(parseReplayFile(JSON.parse(JSON.stringify(legacy)))!)).toEqual([0, 1]);
  });
});

describe("grid clone", () => {
  it("does not alias height or objects", () => {
    const grid = grass(8, 8);
    grid.setHeight(2, 3, 7);
    const copy = grid.clone();
    grid.setHeight(2, 3, 0);
    expect(copy.heightAt(2, 3)).toBe(7);

    const src = new ObjectGrid(8, 8);
    src.place({ kind: "tree", x: 1, y: 1, sheet: 0, capacity: 0, stateProgress: 1 });
    const cloned = src.clone();
    src.remove(1, 1);
    expect(cloned.get(1, 1)?.kind).toBe("tree");
  });
});

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe("replay store", () => {
  it("keeps newest first and round-trips JSON", () => {
    const store = new ReplayStore(new MemoryStorage());
    const a = kit();
    a.dispatch({ type: "placeColony", at: { x: 32, y: 32 }, player: 0 });
    a.enqueue({ type: "destroyBuilding", at: { x: 32, y: 32 } });
    a.tick();
    const file = makeReplayFile({ mapId: "a", mapName: "A", seed: 1, me: 0, world: a })!;
    store.save(file);
    expect(store.list()).toHaveLength(1);
    expect(store.get(file.id)?.checksum).toBe(file.checksum);
    store.remove(file.id);
    expect(store.list()).toHaveLength(0);
  });
});
