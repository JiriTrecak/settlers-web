/**
 * Roman geologist. Walks off own land, probes mountain, plants a resource sign.
 * Not a civilian — pathing ignores ownership. Attackable, deals no damage.
 * Kit has none; convert a bearer (G).
 */
import type { SettlerDef } from "../types";

export const geologist = {
  kind: "geologist",
  stepMs: 450,
  restMs: 0,
  /** Study rocks 1.4s + plant the sign 1.5s. */
  chopMs: 2900,
  needsPlayersGround: false,
  attackable: true,
  controllable: true,
  health: 100,
  strength: 0,
} as const satisfies SettlerDef;
