/** Save file parse/store + snapshot restore + replay export. */
import { describe, expect, it } from "vitest";
import { localMatch, namedMatch, parseSaveForHost, SAVE_FORMAT_VERSION } from "../../src/shared";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { seedRng } from "../../src/sim/rng/rng";
import { World } from "../../src/sim/world/world";
import { makeSaveFile, parseSaveFile, parseSaveList, restoreWorld, saveInfo, saveToReplay, savesForMode } from "../../src/session/save/save";
import { SaveStore } from "../../src/session/save/store";

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

function match() {
  return localMatch({ mapId: "test", mapRevision: "test", seed: 1, slotCount: 2, me: 0 });
}

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe("save file", () => {
  it("JSON roundtrip restores checksum and continues", () => {
    const a = kit();
    a.enqueue({ type: "placeBuilding", kind: "lumberjack", at: { x: 20, y: 40 }, player: 0 }, 10);
    for (let i = 0; i < 40; i++) a.tick();
    const file = makeSaveFile({
      name: "slot 1",
      mapName: "Test",
      me: 0,
      remote: false,
      match: match(),
      world: a,
    });
    const round = parseSaveFile(JSON.parse(JSON.stringify(file)));
    expect(round).not.toBeNull();
    expect(round!.v).toBe(SAVE_FORMAT_VERSION);
    const b = restoreWorld(round!);
    expect(b).not.toBeNull();
    expect(b!.checksum()).toBe(file.checksum);
    expect(b!.checksum()).toBe(a.checksum());
    for (let i = 0; i < 80; i++) {
      a.tick();
      b!.tick();
    }
    expect(b!.checksum()).toBe(a.checksum());
  });

  it("rejects a different format version", () => {
    const a = kit();
    const file = makeSaveFile({ name: "x", mapName: "T", me: 0, remote: false, match: match(), world: a });
    const raw = JSON.parse(JSON.stringify(file)) as { v: number };
    raw.v = SAVE_FORMAT_VERSION + 1;
    expect(parseSaveFile(raw)).toBeNull();
  });

  it("keeps slot names for multiplayer reload", () => {
    const a = kit();
    const cfg = match();
    cfg.slots[0]!.name = "Ada";
    cfg.slots[1]!.name = "Bob";
    const file = makeSaveFile({ name: "mp", mapName: "T", me: 0, remote: true, match: cfg, world: a });
    const round = parseSaveFile(JSON.parse(JSON.stringify(file)))!;
    expect(round.remote).toBe(true);
    expect(round.match.slots.map((s) => s.name)).toEqual(["Ada", "Bob"]);
  });

  it("exports a replay that reconstructs the same checksum", () => {
    const a = kit();
    for (let i = 0; i < 20; i++) a.tick();
    const file = makeSaveFile({ name: "x", mapName: "T", me: 0, remote: false, match: match(), world: a });
    const replay = saveToReplay(file);
    const b = new World(grass(64, 64), undefined, seedRng(1));
    b.replay(replay.log, replay.duration);
    expect(b.checksum()).toBe(file.checksum);
    expect(b.clock.tickIndex).toBe(file.duration);
  });

  it("store keeps newest first", () => {
    const store = new SaveStore(new MemoryStorage());
    const a = kit();
    const f1 = makeSaveFile({ name: "a", mapName: "A", me: 0, remote: false, match: match(), world: a });
    for (let i = 0; i < 5; i++) a.tick();
    const f2 = makeSaveFile({ name: "b", mapName: "B", me: 0, remote: false, match: match(), world: a });
    store.save(f1);
    store.save(f2);
    expect(store.list().map((f) => f.name)).toEqual(["b", "a"]);
    expect(store.get(f1.id)?.checksum).toBe(f1.checksum);
    store.remove(f2.id);
    expect(store.list()).toHaveLength(1);
  });

  it("store overwrite of the same id replaces the blob", () => {
    const store = new SaveStore(new MemoryStorage());
    const a = kit();
    const f1 = makeSaveFile({ name: "slot", mapName: "A", me: 0, remote: false, match: match(), world: a });
    store.save(f1);
    for (let i = 0; i < 10; i++) a.tick();
    const f2 = makeSaveFile({ name: "slot", mapName: "A", me: 0, remote: false, match: match(), world: a });
    f2.id = f1.id;
    store.save(f2);
    expect(store.list()).toHaveLength(1);
    expect(store.get(f1.id)?.checksum).toBe(f2.checksum);
    expect(store.get(f1.id)?.duration).toBe(10);
  });

  it("parseSaveForHost rejects a bumped version without reading the world blob", () => {
    const a = kit();
    const file = makeSaveFile({ name: "x", mapName: "T", me: 0, remote: true, match: match(), world: a });
    const raw = JSON.parse(JSON.stringify(file)) as { v: number };
    raw.v = SAVE_FORMAT_VERSION + 1;
    expect(parseSaveForHost(raw)).toBeNull();
    expect(parseSaveFile(raw)).toBeNull();
  });

  it("SP and MP lists stay separate", () => {
    const a = kit();
    const sp = makeSaveFile({ name: "sp", mapName: "A", me: 0, remote: false, match: match(), world: a });
    const mp = makeSaveFile({ name: "mp", mapName: "A", me: 0, remote: true, match: match(), world: a });
    expect(savesForMode([sp, mp], false).map((f) => f.name)).toEqual(["sp"]);
    expect(savesForMode([sp, mp], true).map((f) => f.name)).toEqual(["mp"]);
    expect(saveInfo(sp).remote).toBe(false);
    expect(saveInfo(mp).remote).toBe(true);
    expect(parseSaveFile(JSON.parse(JSON.stringify(sp)))!.remote).toBe(false);
    expect(parseSaveFile(JSON.parse(JSON.stringify(mp)))!.remote).toBe(true);
  });

  it("rejects a missing remote stamp, truncated log, or missing pipeline", () => {
    const a = kit();
    const file = makeSaveFile({ name: "x", mapName: "T", me: 0, remote: true, match: match(), world: a });
    const dropRemote = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    delete dropRemote.remote;
    expect(parseSaveFile(dropRemote)).toBeNull();
    expect(parseSaveForHost(dropRemote)).toBeNull();

    const badLog = JSON.parse(JSON.stringify(file)) as { log: unknown[] };
    badLog.log = [null];
    expect(parseSaveFile(badLog)).toBeNull();

    const dropPipe = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    delete dropPipe.pipeline;
    expect(parseSaveFile(dropPipe)).toBeNull();
    expect(parseSaveForHost(dropPipe)).toBeNull();
  });

  it("restoreWorld refuses a tampered checksum", () => {
    const a = kit();
    const file = makeSaveFile({ name: "x", mapName: "T", me: 0, remote: false, match: match(), world: a });
    file.checksum = file.checksum + 1;
    expect(restoreWorld(file)).toBeNull();
    const ok = makeSaveFile({ name: "y", mapName: "T", me: 0, remote: false, match: match(), world: a });
    expect(restoreWorld(ok)?.checksum()).toBe(a.checksum());
  });

  it("namedMatch overlays lobby names without mutating the save", () => {
    const cfg = match();
    cfg.slots[0]!.name = "OldA";
    cfg.slots[1]!.name = "OldB";
    const next = namedMatch(cfg, new Map([[0, "Ada"], [1, "Bob"]]));
    expect(next.slots.map((s) => s.name)).toEqual(["Ada", "Bob"]);
    expect(cfg.slots.map((s) => s.name)).toEqual(["OldA", "OldB"]);
    expect(next.roomId).toBe(cfg.roomId);
    expect(next.seed).toBe(cfg.seed);
  });

  it("store drops the oldest past the cap and skips garbage in the shelf JSON", () => {
    const store = new SaveStore(new MemoryStorage());
    const a = kit();
    const base = makeSaveFile({ name: "0", mapName: "A", me: 0, remote: false, match: match(), world: a });
    for (let i = 0; i < 26; i++) {
      store.save({ ...base, id: `id-${i}`, name: `s${i}`, savedAt: i });
    }
    const names = store.list().map((f) => f.name);
    expect(names).toHaveLength(24);
    expect(names[0]).toBe("s25");
    expect(names.at(-1)).toBe("s2");
    expect(parseSaveList([base, { v: 0 }, null, "x"])).toEqual([base]);
  });
});
