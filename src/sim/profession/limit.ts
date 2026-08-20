/**
 * Civilian profession caps. Diggers and bricklayers are pools: a bearer walks
 * to a blade / hammer, picks it up, and stays that profession. Default 25% of
 * workers each (non-controllable civilians). Each pool fills to its cap on
 * its own; Tools ±1. Lowering converts excess idle units back (tool drops
 * beside them).
 */
import { isControllable } from "../data/settlers";
import type { Goods } from "../data/types";
import type { Movable } from "../movable/movable";

/** Start-kit cap: 16 workers → 4 of this profession if the tool exists. */
export const DEFAULT_TOOL_RATIO = 0.25;
export const DEFAULT_DIGGER_RATIO = DEFAULT_TOOL_RATIO;
export const DEFAULT_BRICKLAYER_RATIO = DEFAULT_TOOL_RATIO;

/** Tools page step. */
export const DIGGER_RATIO_STEP = 0.05;

/** Digger tool. Kit piles 5. */
export const DIGGER_TOOL: Goods = "blade";

/** Bricklayer tool. Kit piles 6. */
export const BRICKLAYER_TOOL: Goods = "hammer";

export type ToolKind = "digger" | "bricklayer";

/** Bearers, workers, diggers, bricklayers — not pioneers / soldiers. */
export function workerCount(units: readonly Movable[], player: number): number {
  let n = 0;
  for (const m of units) {
    if (m.player !== player || m.health <= 0) continue;
    if (isControllable(m.type)) continue;
    n += 1;
  }
  return n;
}

/** Live profession plus bearers already walking to that tool. */
export function toolSlots(units: readonly Movable[], player: number, kind: ToolKind): number {
  let n = 0;
  for (const m of units) {
    if (m.player !== player || m.health <= 0) continue;
    if (m.type === kind) n += 1;
    else if (m.job?.type === "equip" && m.job.become === kind) n += 1;
  }
  return n;
}

export function diggerSlots(units: readonly Movable[], player: number): number {
  return toolSlots(units, player, "digger");
}

/** `ratio * workers - slots`. Need ≥ 1 to convert another bearer. */
export function remainingToolSlots(
  units: readonly Movable[],
  player: number,
  ratio: number,
  kind: ToolKind,
): number {
  return ratio * workerCount(units, player) - toolSlots(units, player, kind);
}

export function remainingDiggerSlots(units: readonly Movable[], player: number, ratio: number): number {
  return remainingToolSlots(units, player, ratio, "digger");
}

export function canConvertTool(
  units: readonly Movable[],
  player: number,
  ratio: number,
  kind: ToolKind,
): boolean {
  return remainingToolSlots(units, player, ratio, kind) >= 1;
}

export function canConvertDigger(units: readonly Movable[], player: number, ratio: number): boolean {
  return canConvertTool(units, player, ratio, "digger");
}

/** How many of this profession `ratio` allows at this civilian count. */
export function toolCap(workers: number, ratio: number): number {
  if (workers <= 0) return 0;
  return Math.min(workers, Math.max(0, Math.floor(ratio * workers + 1e-6)));
}

export const diggerCap = toolCap;

export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.min(1, Math.max(0, ratio));
}
