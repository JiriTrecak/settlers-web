/**
 * Roman L1 swordsman. Walks off own land, auto-aggro 30, melee 1 hex / 1s.
 * Local kit 8, opponent 3. Barracks later.
 */
import type { SettlerDef } from "../types";

export const swordsman = {
  kind: "swordsman",
  stepMs: 338,
  restMs: 0,
  chopMs: 1000,
  needsPlayersGround: false,
  attackable: true,
  controllable: true,
  health: 100,
  strength: 10,
  searchRadius: 30,
  attackRange: 1,
  sheet: "swordsman-l1",
} as const satisfies SettlerDef;
