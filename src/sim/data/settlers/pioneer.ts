/**
 * Roman pioneer. Walks off own land, kneels 1.2s, takes one unenforced tile.
 * Not a civilian — pathing ignores ownership. Kit has none; convert a bearer.
 */
import type { SettlerDef } from "../types";

export const pioneer = {
  kind: "pioneer",
  stepMs: 450,
  restMs: 0,
  chopMs: 1200,
  needsPlayersGround: false,
} as const satisfies SettlerDef;
