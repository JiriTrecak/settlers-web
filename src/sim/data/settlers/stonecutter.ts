/**
 * Roman stonecutter. Picks rocks in the hut work radius, dumps stone on the offer stack.
 * Pick is 6 × 750 ms ACTION1; no fall clip.
 */
import type { SettlerDef } from "../types";

export const stonecutter = {
  kind: "stonecutter",
  stepMs: 450,
  restMs: 3000,
  chopMs: 4500,
  workplace: "stonecutter",
} as const satisfies SettlerDef;
