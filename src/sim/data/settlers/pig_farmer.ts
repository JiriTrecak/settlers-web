/**
 * Roman pig farmer. Takes crop and water, produces a pig on the offer.
 */
import type { SettlerDef } from "../types";

export const pig_farmer = {
  kind: "pig_farmer",
  stepMs: 450,
  restMs: 3000,
  chopMs: 2000,
  workplace: "pig_farm",
  sheet: "pig-farmer",
} as const satisfies SettlerDef;
