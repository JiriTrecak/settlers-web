/**
 * Roman farmer. Occupies a farm after picking up a scythe.
 * Plants crop in the work circle, harvests when grown, dumps on the offer.
 */
import type { SettlerDef } from "../types";

export const farmer = {
  kind: "farmer",
  stepMs: 450,
  restMs: 8000,
  /** Scythe / plant loops. Harvest and plant share this window. */
  chopMs: 4000,
  workplace: "farm",
  tool: "scythe",
} as const satisfies SettlerDef;
