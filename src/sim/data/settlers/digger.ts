/**
 * Roman digger. Pool profession: a bearer picks up a blade and stays a digger.
 * Kneel 1s, ±1 toward the hut's frozen mean. Idle between plots — does not revert.
 */
import type { SettlerDef } from "../types";

export const digger = {
  kind: "digger",
  stepMs: 450,
  restMs: 0,
  /** One 1s kneel per tile. */
  chopMs: 1000,
} as const satisfies SettlerDef;
