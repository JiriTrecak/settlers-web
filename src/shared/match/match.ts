/**
 * Frozen match start. Same object on every peer; no process-wide statics.
 * Delay D is ticks. Default 8 (200 ms). Tests may use 1.
 */
export const COMMAND_DELAY = 8;
export const CHECKSUM_EVERY = 8;
export const TICK_MS = 25;

export type SlotKind = "human" | "ai";

export type Slot = {
  player: number;
  kind: SlotKind;
  name?: string;
};

export type MatchConfig = {
  v: 1;
  roomId: string;
  mapId: string;
  mapRevision: string;
  seed: number;
  delay: number;
  checksumEvery: number;
  tickMs: typeof TICK_MS;
  slots: Slot[];
};

/** SP / vitest: one human slot + AI for the rest. `me` is the local human. */
export function localMatch(args: {
  mapId: string;
  mapRevision: string;
  seed: number;
  slotCount: number;
  me: number;
  delay?: number;
}): MatchConfig {
  const n = Math.max(1, args.slotCount);
  const me = args.me;
  const slots: Slot[] =
    n <= 1
      ? [{ player: me, kind: "human" }]
      : Array.from({ length: n }, (_, player) => ({
          player,
          kind: (player === me ? "human" : "ai") as SlotKind,
        }));
  return {
    v: 1,
    roomId: "local",
    mapId: args.mapId,
    mapRevision: args.mapRevision,
    seed: args.seed,
    delay: args.delay ?? COMMAND_DELAY,
    checksumEvery: CHECKSUM_EVERY,
    tickMs: TICK_MS,
    slots,
  };
}
