/**
 * Roman sawmiller. Takes trunks from the mill request, saws, dumps planks on the offer.
 */
import type { SettlerDef } from "../types";

export const sawmiller = {
  kind: "sawmiller",
  stepMs: 450,
  restMs: 1000,
  chopMs: 4500,
  workplace: "sawmill",
} as const satisfies SettlerDef;
