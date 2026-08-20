/**
 * Roman fisherman. Occupies a fisher hut after picking up a fishing rod.
 * Pulls fish from water deposits in the work radius.
 */
import type { SettlerDef } from "../types";

export const fisherman = {
  kind: "fisherman",
  stepMs: 450,
  restMs: 3000,
  chopMs: 1500,
  workplace: "fisher",
  tool: "fishingrod",
} as const satisfies SettlerDef;
