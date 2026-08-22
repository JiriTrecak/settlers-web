/**
 * Roman miner. Occupies a coal / iron / gold mine after picking up a pick.
 * Sleeps 3s inside, pulls one ore from a random blocked tile, dumps it on the offer.
 */
import type { SettlerDef } from "../types";

export const miner = {
  kind: "miner",
  stepMs: 450,
  /** Original miningInterval is 3s of sleep before each pull. */
  restMs: 3000,
  tool: "pick",
} as const satisfies SettlerDef;
