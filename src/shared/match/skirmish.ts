import type { PlayerStart } from "../map/utcmap";
import {
  CHECKSUM_EVERY,
  TICK_MS,
  type MatchConfig,
  type Slot,
  type SlotKind,
} from "./match";

/** Lobby state is independent of UI and transport. Player IDs are map start IDs minus one. */
export type MatchSetup = { mapId: string; slots: Slot[] };
export function defaultSlots(
  starts: readonly PlayerStart[],
  human: number | null = starts[0].player - 1,
): Slot[] {
  return [...starts]
    .sort((a, b) => a.player - b.player)
    .map((start) => ({
      player: start.player - 1,
      kind: start.player - 1 === human ? "human" : "ai",
    }));
}
/** A local seat can occupy any start. Zero humans is an observer; all starts remain occupied. */
export function setLocalController(
  slots: readonly Slot[],
  player: number,
  kind: SlotKind,
): Slot[] {
  return slots.map((slot) => ({
    ...slot,
    kind: slot.player === player ? kind : kind === "human" ? "ai" : slot.kind,
  }));
}
export function createSkirmishMatch(
  setup: MatchSetup,
  starts: readonly PlayerStart[],
  revision: string,
  name = "",
  seed = 1,
): { match: MatchConfig; player: number | null } {
  const ids = starts.map((s) => s.player - 1),
    humans = setup.slots.filter((s) => s.kind === "human");
  if (
    ids.length < 2 ||
    ids.length > 8 ||
    new Set(ids).size !== ids.length ||
    setup.slots.length !== ids.length ||
    new Set(setup.slots.map((s) => s.player)).size !== ids.length ||
    setup.slots.some(
      (s) => !ids.includes(s.player) || !["human", "ai"].includes(s.kind),
    )
  )
    throw new Error(
      "Choose one participant for every map start (at least two players).",
    );
  if (humans.length > 1)
    throw new Error(
      "A local skirmish supports one human or an AI-only observer match.",
    );
  const player = humans[0]?.player ?? null;
  return {
    player,
    match: {
      v: 1,
      roomId: "local",
      mapId: setup.mapId,
      mapRevision: revision,
      seed,
      delay: 1,
      checksumEvery: CHECKSUM_EVERY,
      tickMs: TICK_MS,
      slots: setup.slots.map((s) => ({
        ...s,
        name:
          s.kind === "human"
            ? name.trim() || "You"
            : `Computer ${s.player + 1}`,
      })),
    },
  };
}
