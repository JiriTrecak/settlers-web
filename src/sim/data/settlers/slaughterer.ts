/**
 * Roman slaughterer. Takes a pig from the request, works, dumps meat on the offer.
 * Occupies after picking up an axe.
 */
import type { SettlerDef } from "../types";

export const slaughterer = {
  kind: "slaughterer",
  stepMs: 450,
  restMs: 4000,
  chopMs: 5700,
  workplace: "slaughterhouse",
  tool: "axe",
} as const satisfies SettlerDef;
