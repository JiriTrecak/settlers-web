/** Building defs. One file per hut; this file is the registry. */
import { baker } from "./baker";
import { coalmine } from "./coalmine";
import { farm } from "./farm";
import { fisher } from "./fisher";
import { forester } from "./forester";
import { goldmine } from "./goldmine";
import { ironmine } from "./ironmine";
import { lumberjack } from "./lumberjack";
import { mill } from "./mill";
import { pig_farm } from "./pig_farm";
import { sawmill } from "./sawmill";
import { slaughterhouse } from "./slaughterhouse";
import { small_livinghouse } from "./small_livinghouse";
import { stonecutter } from "./stonecutter";
import { tower } from "./tower";
import { waterworks } from "./waterworks";

export const buildings = {
  baker,
  coalmine,
  farm,
  fisher,
  forester,
  goldmine,
  ironmine,
  lumberjack,
  mill,
  pig_farm,
  sawmill,
  slaughterhouse,
  small_livinghouse,
  stonecutter,
  tower,
  waterworks,
} as const;

export type BuildingKind = keyof typeof buildings;

export function buildingDef<K extends BuildingKind>(kind: K): (typeof buildings)[K] {
  return buildings[kind];
}

/** Outdoor gatherers / planters (lumberjack, stonecutter, forester, later fisherman / grain). */
export function hasWorkArea(kind: BuildingKind): boolean {
  return buildingDef(kind).workRadius > 0;
}
