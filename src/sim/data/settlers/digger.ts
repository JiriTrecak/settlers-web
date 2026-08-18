/**
 * Roman digger. Temporary: construction recruits a bearer onto a plan that
 * still has height work. Kneel 1s, ±1 toward the hut's frozen mean, revert.
 */
import type { SettlerDef } from "../types";

export const digger = {
  kind: "digger",
  stepMs: 450,
  restMs: 0,
  /** One 1s kneel per tile. */
  chopMs: 1000,
} as const satisfies SettlerDef;
