/**
 * Roman forester. Rests in the hut, walks out with a sapling, plants, goes home.
 */
import type { SettlerDef } from "../types";

export const forester = {
  kind: "forester",
  stepMs: 450,
  restMs: 4000,
  /** Kneel-and-plant ACTION1. */
  chopMs: 3000,
  workplace: "forester",
} as const satisfies SettlerDef;
