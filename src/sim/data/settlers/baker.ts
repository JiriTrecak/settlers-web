/**
 * Roman baker. Takes flour and water, bakes, dumps bread on the offer.
 */
import type { SettlerDef } from "../types";

export const baker = {
  kind: "baker",
  stepMs: 450,
  restMs: 1000,
  chopMs: 9000,
  workplace: "baker",
} as const satisfies SettlerDef;
