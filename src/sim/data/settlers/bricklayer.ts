/**
 * Roman bricklayer. Temporary: a bearer walks to a construction spot, hammers, then reverts.
 */
import type { SettlerDef } from "../types";

export const bricklayer = {
  kind: "bricklayer",
  stepMs: 450,
  restMs: 0,
  /** One 1s hammer swing. Construction progress bumps once per swing. */
  chopMs: 1000,
} as const satisfies SettlerDef;
