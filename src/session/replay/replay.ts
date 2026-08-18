/**
 * Replay file: seed + map + action log + duration. Same payload lockstep will ship.
 * Wall-clock `savedAt` is metadata; sim never reads it.
 */
import type { Action } from "../../shared";
import type { LoggedAction, MatchOutcome, World } from "../../sim";

export const REPLAY_VERSION = 1;
/** World RNG until MatchConfig injects a seed. Recorded so reconstruct doesn't guess. */
export const DEFAULT_WORLD_SEED = 1;

export type ReplayFile = {
  v: typeof REPLAY_VERSION;
  id: string;
  savedAt: number;
  mapId: string;
  mapName: string;
  seed: number;
  me: number;
  /** Slots in the match. Older files omit this; infer from the log. */
  players?: readonly number[];
  duration: number;
  checksum: number;
  outcome: MatchOutcome;
  log: LoggedAction[];
};

export type ReplayResult = "victory" | "defeat" | "ended" | "saved";

export type ReplayInfo = {
  id: string;
  mapName: string;
  savedAt: number;
  duration: number;
  result: ReplayResult;
};

export function replayResult(file: ReplayFile): ReplayResult {
  const o = file.outcome;
  if (o.winner === file.me) return "victory";
  if (o.defeated.includes(file.me)) return "defeat";
  if (o.defeated.length === 0) return "saved";
  return "ended";
}

export function replayInfo(file: ReplayFile): ReplayInfo {
  return {
    id: file.id,
    mapName: file.mapName,
    savedAt: file.savedAt,
    duration: file.duration,
    result: replayResult(file),
  };
}

export function makeReplayFile(args: {
  mapId: string;
  mapName: string;
  seed: number;
  me: number;
  world: World;
}): ReplayFile {
  const outcome = args.world.outcome;
  return {
    v: REPLAY_VERSION,
    id: crypto.randomUUID(),
    savedAt: Date.now(),
    mapId: args.mapId,
    mapName: args.mapName,
    seed: args.seed,
    me: args.me,
    players: replayPlayersFromLog(args.me, args.world.log(), args.world.outcome),
    duration: args.world.clock.tickIndex,
    checksum: args.world.checksum(),
    outcome: outcome
      ? { winner: outcome.winner, defeated: [...outcome.defeated] }
      : { winner: null, defeated: [] },
    log: args.world.log().map((e) => ({ tick: e.tick, player: e.player, action: e.action })),
  };
}

export function parseReplayFile(raw: unknown): ReplayFile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== REPLAY_VERSION) return null;
  if (typeof o.id !== "string" || typeof o.mapId !== "string" || typeof o.mapName !== "string") return null;
  if (typeof o.savedAt !== "number" || typeof o.seed !== "number" || typeof o.me !== "number") return null;
  if (typeof o.duration !== "number" || typeof o.checksum !== "number") return null;
  const outcome = parseOutcome(o.outcome);
  if (!outcome) return null;
  if (!Array.isArray(o.log)) return null;
  const log: LoggedAction[] = [];
  for (const item of o.log) {
    const e = parseLogged(item);
    if (!e) return null;
    log.push(e);
  }
  return {
    v: REPLAY_VERSION,
    id: o.id,
    savedAt: o.savedAt,
    mapId: o.mapId,
    mapName: o.mapName,
    seed: o.seed,
    me: o.me,
    players: parsePlayers(o.players),
    duration: o.duration,
    checksum: o.checksum,
    outcome,
    log,
  };
}

export function parseReplayList(raw: unknown): ReplayFile[] {
  if (!Array.isArray(raw)) return [];
  const out: ReplayFile[] = [];
  for (const item of raw) {
    const file = parseReplayFile(item);
    if (file) out.push(file);
  }
  return out;
}

/** Unique slots, 0-based, sorted. Uses `file.players` when present; else the log. */
export function replayPlayers(file: ReplayFile): number[] {
  if (file.players && file.players.length > 0) {
    return uniquePlayers(file.players);
  }
  return replayPlayersFromLog(file.me, file.log, file.outcome);
}

function replayPlayersFromLog(
  me: number,
  log: readonly LoggedAction[],
  outcome: MatchOutcome | null,
): number[] {
  const ids = new Set<number>([me]);
  for (const e of log) ids.add(e.player);
  if (outcome?.winner != null) ids.add(outcome.winner);
  if (outcome) for (const p of outcome.defeated) ids.add(p);
  return uniquePlayers(ids);
}

function uniquePlayers(ids: Iterable<number>): number[] {
  return [...new Set(ids)].filter((p) => p >= 0).sort((a, b) => a - b);
}

function parsePlayers(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw) || raw.some((p) => typeof p !== "number")) return undefined;
  const ids = uniquePlayers(raw as number[]);
  return ids.length > 0 ? ids : undefined;
}

function parseOutcome(raw: unknown): MatchOutcome | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.winner !== null && typeof o.winner !== "number") return null;
  if (!Array.isArray(o.defeated) || o.defeated.some((p) => typeof p !== "number")) return null;
  return { winner: o.winner, defeated: o.defeated as number[] };
}

function parseLogged(raw: unknown): LoggedAction | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.tick !== "number" || typeof o.player !== "number") return null;
  if (!o.action || typeof o.action !== "object") return null;
  const action = o.action as Action;
  if (typeof action.type !== "string") return null;
  return { tick: o.tick, player: o.player, action };
}
