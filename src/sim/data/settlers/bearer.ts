/**
 * Bearer. Hauls goods between offer and request stacks.
 */
import type { SettlerDef } from "../types";

export const bearer = {
  kind: "bearer",
  stepMs: 450,
  restMs: 0,
} as const satisfies SettlerDef;
