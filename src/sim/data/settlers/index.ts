/** Settler defs. One file per profession; this file is the registry. */
import { bearer } from "./bearer";
import { bricklayer } from "./bricklayer";
import { forester } from "./forester";
import { lumberjack } from "./lumberjack";
import { sawmiller } from "./sawmiller";

export const settlers = {
  bearer,
  bricklayer,
  forester,
  lumberjack,
  sawmiller,
} as const;

export type SettlerKind = keyof typeof settlers;

export function settlerDef<K extends SettlerKind>(kind: K): (typeof settlers)[K] {
  return settlers[kind];
}
