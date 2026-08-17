/**
 * Roman lumberjack. Chops in the hut work radius, dumps trunks on the offer stack.
 * Axe is 6 × 1s swings; the tree falls over the last 1.5s (13 frames).
 */
import type { SettlerDef } from "../types";

export const lumberjack = {
  kind: "lumberjack",
  stepMs: 450,
  restMs: 3000,
  chopMs: 6000,
  fallMs: 1500,
  workplace: "lumberjack",
} as const satisfies SettlerDef;
