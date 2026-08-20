/**
 * Roman miller. Takes crop from the mill request, grinds, dumps flour on the offer.
 */
import type { SettlerDef } from "../types";

export const miller = {
  kind: "miller",
  stepMs: 450,
  restMs: 1000,
  /** 1s in + 5s mill + 1s out. */
  chopMs: 7000,
  workplace: "mill",
} as const satisfies SettlerDef;
