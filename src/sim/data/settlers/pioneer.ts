/**
 * Roman pioneer. Walks off own land, kneels 1.2s, takes one unenforced tile.
 * Not a civilian — pathing ignores ownership. Attackable, deals no damage.
 * Kit has none; convert a bearer.
 */
import type { SettlerDef } from "../types";

export const pioneer = {
  kind: "pioneer",
  stepMs: 450,
  restMs: 0,
  chopMs: 1200,
  needsPlayersGround: false,
  attackable: true,
  controllable: true,
  health: 100,
  strength: 0,
} as const satisfies SettlerDef;
