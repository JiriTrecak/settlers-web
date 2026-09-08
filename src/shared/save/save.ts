/**
 * Save envelope the net layer may inspect. World blob is opaque here (sim parses it).
 * Bump `SAVE_FORMAT_VERSION` when the JSON shape changes — old files become unloadable.
 */
import { z } from "zod";
import { actionSchema } from "../types/types";
import type { Action } from "../types/types";
import {
  COMMAND_DELAY,
  localMatch,
  type MatchConfig,
  type Slot,
} from "../match/match";
import type { Commit } from "../net/wire";

export const SAVE_FORMAT_VERSION = 3;

export type PipelineSnap = {
  /** Room's last committed tick. May be ahead of the World by D. */
  committed: number;
  through: { player: number; through: number }[];
  held: { player: number; tick: number; actions: Action[] }[];
  /** Unapplied commits (tick > world.tickIndex, tick <= committed). */
  commits: Commit[];
  sentThrough: number;
};

export type SaveMeta = {
  v: typeof SAVE_FORMAT_VERSION;
  id: string;
  name: string;
  savedAt: number;
  mapId: string;
  mapName: string;
  mapRevision: string;
  seed: number;
  me: number;
  /** `false` = singleplayer save. `true` = multiplayer save. Load lists are filtered on this. */
  remote: boolean;
  match: MatchConfig;
  duration: number;
  checksum: number;
};

export function emptyPipeline(
  tick: number,
  slots: readonly Slot[],
  delay = 1,
): PipelineSnap {
  return {
    committed: tick,
    through: slots.map((s) => ({ player: s.player, through: tick })),
    held: [],
    commits: [],
    sentThrough: tick + delay,
  };
}

const natural = z.number().int().nonnegative();
export const pipelineSchema = z
  .object({
    committed: natural,
    sentThrough: natural,
    through: z.array(z.object({ player: natural, through: natural }).strict()),
    held: z.array(
      z
        .object({
          player: natural,
          tick: natural,
          actions: z.array(actionSchema),
        })
        .strict(),
    ),
    commits: z.array(
      z
        .object({
          tick: natural,
          slots: z.array(
            z
              .object({ player: natural, actions: z.array(actionSchema) })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();
export function parsePipeline(raw: unknown): PipelineSnap | null {
  const result = pipelineSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseMatchConfig(raw: unknown): MatchConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (
    typeof o.roomId !== "string" ||
    typeof o.mapId !== "string" ||
    typeof o.mapRevision !== "string"
  )
    return null;
  if (
    typeof o.seed !== "number" ||
    typeof o.delay !== "number" ||
    typeof o.checksumEvery !== "number"
  )
    return null;
  if (
    typeof o.tickMs !== "number" ||
    !Array.isArray(o.slots) ||
    o.slots.length < 1
  )
    return null;
  const slots: Slot[] = [];
  for (const s of o.slots) {
    if (!s || typeof s !== "object") return null;
    const r = s as Record<string, unknown>;
    if (typeof r.player !== "number" || (r.kind !== "human" && r.kind !== "ai"))
      return null;
    slots.push({
      player: r.player,
      kind: r.kind,
      ...(typeof r.team === "number" ? { team: r.team } : {}),
      name: typeof r.name === "string" ? r.name : undefined,
    });
  }
  return {
    v: 1,
    roomId: o.roomId,
    mapId: o.mapId,
    mapRevision: o.mapRevision,
    seed: o.seed,
    delay: o.delay,
    checksumEvery: o.checksumEvery,
    tickMs: o.tickMs as MatchConfig["tickMs"],
    slots,
  };
}

/** Host/net: enough to resume the mailbox. World stays opaque. */
export function parseSaveForHost(
  raw: unknown,
): { match: MatchConfig; pipeline: PipelineSnap; remote: boolean } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== SAVE_FORMAT_VERSION) return null;
  if (typeof o.remote !== "boolean") return null;
  const match = parseMatchConfig(o.match);
  const pipeline = parsePipeline(o.pipeline);
  if (!match || !pipeline) return null;
  return { match, pipeline, remote: o.remote };
}

export function namedMatch(
  match: MatchConfig,
  names: ReadonlyMap<number, string>,
): MatchConfig {
  return {
    ...match,
    slots: match.slots.map((s) => ({
      ...s,
      name: names.get(s.player) ?? s.name,
    })),
  };
}

export { COMMAND_DELAY, localMatch };
