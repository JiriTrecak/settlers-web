/** Settler defs. One file per profession; this file is the registry. */
import { DEFAULT_UNIT_VIEW_DISTANCE } from "../../fog/constants";
import type { SettlerDef } from "../types";
import { baker } from "./baker";
import { bearer } from "./bearer";
import { bricklayer } from "./bricklayer";
import { digger } from "./digger";
import { farmer } from "./farmer";
import { fisherman } from "./fisherman";
import { forester } from "./forester";
import { geologist } from "./geologist";
import { lumberjack } from "./lumberjack";
import { miller } from "./miller";
import { miner } from "./miner";
import { pig_farmer } from "./pig_farmer";
import { pioneer } from "./pioneer";
import { sawmiller } from "./sawmiller";
import { slaughterer } from "./slaughterer";
import { stonecutter } from "./stonecutter";
import { swordsman } from "./swordsman";
import { waterworker } from "./waterworker";

export const settlers = {
  baker,
  bearer,
  bricklayer,
  digger,
  farmer,
  fisherman,
  forester,
  geologist,
  lumberjack,
  miller,
  miner,
  pig_farmer,
  pioneer,
  sawmiller,
  slaughterer,
  stonecutter,
  swordsman,
  waterworker,
} as const;

export type SettlerKind = keyof typeof settlers;

export function settlerDef<K extends SettlerKind>(kind: K): (typeof settlers)[K] {
  return settlers[kind];
}

/** Walk/flock on own land. Omit on the def → true. */
export function needsPlayersGround(kind: SettlerKind): boolean {
  const def: SettlerDef = settlerDef(kind);
  return def.needsPlayersGround !== false;
}

/** Fog look radius. Omit on the def → 8. */
export function unitViewDistance(kind: SettlerKind): number {
  const def: SettlerDef = settlerDef(kind);
  return def.viewDistance ?? DEFAULT_UNIT_VIEW_DISTANCE;
}

/** Combat target. Omit on the def → false (bearers / workers). */
export function isAttackable(kind: SettlerKind): boolean {
  const def: SettlerDef = settlerDef(kind);
  return def.attackable === true;
}

/** Click-to-command. Omit on the def → false (bearers / workers). */
export function isControllable(kind: SettlerKind): boolean {
  const def: SettlerDef = settlerDef(kind);
  return def.controllable === true;
}

/** Can garrison a tower. Bow / pike later. */
export function isSoldier(kind: SettlerKind): boolean {
  return kind === "swordsman";
}
