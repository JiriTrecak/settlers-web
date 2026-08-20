/**
 * Save file: world snapshot + action log + lockstep pipeline.
 * Load restores the snapshot; the log is for later replay export. Same shape for SP and MP.
 */
import { SAVE_FORMAT_VERSION, emptyPipeline, parseMatchConfig, parsePipeline, type PipelineSnap } from "../../shared";
import type { MatchConfig } from "../../shared";
import type { Lockstep } from "../../net/lockstep";
import type { Room } from "../../net/room";
import { parseLogged, parseWorldSnapshot, World, type LoggedAction, type MatchOutcome, type WorldSnapshot } from "../../sim";
import { REPLAY_VERSION, type ReplayFile } from "../replay/replay";

export { SAVE_FORMAT_VERSION };

export type SaveInfo = {
  id: string;
  name: string;
  mapName: string;
  savedAt: number;
  duration: number;
  remote: boolean;
};

export type SaveFile = {
  v: typeof SAVE_FORMAT_VERSION;
  id: string;
  name: string;
  savedAt: number;
  mapId: string;
  mapName: string;
  mapRevision: string;
  seed: number;
  me: number;
  remote: boolean;
  match: MatchConfig;
  duration: number;
  checksum: number;
  outcome: MatchOutcome | null;
  log: LoggedAction[];
  world: WorldSnapshot;
  pipeline: PipelineSnap;
};

export function saveInfo(file: SaveFile): SaveInfo {
  return {
    id: file.id,
    name: file.name,
    mapName: file.mapName,
    savedAt: file.savedAt,
    duration: file.duration,
    remote: file.remote,
  };
}

/** SP lists only SP files; MP lists only MP files. `remote` is the mode stamp on the save. */
export function savesForMode(files: readonly SaveFile[], remote: boolean): SaveFile[] {
  return files.filter((f) => f.remote === remote);
}

export function makeSaveFile(args: {
  name: string;
  mapName: string;
  me: number;
  remote: boolean;
  match: MatchConfig;
  world: World;
  pipeline?: PipelineSnap;
}): SaveFile {
  const world = args.world;
  const match = args.match;
  return {
    v: SAVE_FORMAT_VERSION,
    id: crypto.randomUUID(),
    name: args.name,
    savedAt: Date.now(),
    mapId: match.mapId,
    mapName: args.mapName,
    mapRevision: match.mapRevision,
    seed: match.seed,
    me: args.me,
    remote: args.remote,
    match,
    duration: world.clock.tickIndex,
    checksum: world.checksum(),
    outcome: world.outcome ? { winner: world.outcome.winner, defeated: [...world.outcome.defeated] } : null,
    log: world.log().map((e) => ({ tick: e.tick, player: e.player, action: e.action })),
    world: world.snapshot(),
    pipeline: args.pipeline ?? emptyPipeline(world.clock.tickIndex, match.slots, match.delay),
  };
}

export function parseSaveFile(raw: unknown): SaveFile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== SAVE_FORMAT_VERSION) return null;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  if (typeof o.savedAt !== "number" || typeof o.mapId !== "string" || typeof o.mapName !== "string") return null;
  if (typeof o.mapRevision !== "string" || typeof o.seed !== "number" || typeof o.me !== "number") return null;
  if (typeof o.remote !== "boolean" || typeof o.duration !== "number" || typeof o.checksum !== "number") return null;
  const match = parseMatchConfig(o.match);
  const pipeline = parsePipeline(o.pipeline);
  const world = parseWorldSnapshot(o.world);
  if (!match || !pipeline || !world) return null;
  if (!Array.isArray(o.log)) return null;
  const log: LoggedAction[] = [];
  for (const item of o.log) {
    const e = parseLogged(item);
    if (!e) return null;
    log.push(e);
  }
  let outcome: MatchOutcome | null = null;
  if (o.outcome != null) {
    if (typeof o.outcome !== "object") return null;
    const out = o.outcome as Record<string, unknown>;
    if (out.winner !== null && typeof out.winner !== "number") return null;
    if (!Array.isArray(out.defeated) || out.defeated.some((p) => typeof p !== "number")) return null;
    outcome = { winner: out.winner, defeated: out.defeated as number[] };
  }
  return {
    v: SAVE_FORMAT_VERSION,
    id: o.id,
    name: o.name,
    savedAt: o.savedAt,
    mapId: o.mapId,
    mapName: o.mapName,
    mapRevision: o.mapRevision,
    seed: o.seed,
    me: o.me,
    remote: o.remote,
    match,
    duration: o.duration,
    checksum: o.checksum,
    outcome,
    log,
    world,
    pipeline,
  };
}

export function parseSaveList(raw: unknown): SaveFile[] {
  if (!Array.isArray(raw)) return [];
  const out: SaveFile[] = [];
  for (const item of raw) {
    const file = parseSaveFile(item);
    if (file) out.push(file);
  }
  return out;
}

/** Replay shelf payload from a save. Does not re-sim. */
export function saveToReplay(file: SaveFile): ReplayFile {
  return {
    v: REPLAY_VERSION,
    id: crypto.randomUUID(),
    savedAt: Date.now(),
    mapId: file.mapId,
    mapName: file.mapName,
    seed: file.seed,
    me: file.me,
    players: file.match.slots.map((s) => s.player),
    duration: file.duration,
    checksum: file.checksum,
    outcome: file.outcome ?? { winner: null, defeated: [] },
    log: file.log,
  };
}

export function restoreWorld(file: SaveFile): World | null {
  const world = World.fromSnapshot(file.world);
  if (!world) return null;
  if (world.checksum() !== file.checksum) return null;
  return world;
}

export function capturePipeline(room: Room, ls: Lockstep): PipelineSnap {
  return { ...room.snapshot(), commits: ls.peek(), sentThrough: ls.sent() };
}

export function restorePipeline(room: Room, ls: Lockstep, snap: PipelineSnap): void {
  room.resume(snap);
  ls.restore(snap.commits, snap.sentThrough);
}
