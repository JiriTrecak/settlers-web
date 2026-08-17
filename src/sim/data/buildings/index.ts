/** Building defs. One file per hut; this file is the registry. */
import { lumberjack } from "./lumberjack";
import { sawmill } from "./sawmill";
import { small_livinghouse } from "./small_livinghouse";
import { tower } from "./tower";

export const buildings = {
  lumberjack,
  sawmill,
  small_livinghouse,
  tower,
} as const;

export type BuildingKind = keyof typeof buildings;

export function buildingDef<K extends BuildingKind>(kind: K): (typeof buildings)[K] {
  return buildings[kind];
}
