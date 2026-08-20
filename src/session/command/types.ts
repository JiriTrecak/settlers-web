/**
 * Session-side command board context. The widget never sees this — only `CommandPage`.
 */
import type { BuildingKind } from "../../sim/data/buildings";

export type PlaceTool =
  | { type: "building"; kind: BuildingKind }
  | { type: "unit"; kind: "swordsman"; count: number }
  | { type: "workArea" };

export type BoardSelection =
  | { type: "none" }
  | { type: "units"; types: string[] }
  | { type: "building"; kind: BuildingKind; state: string; owned: boolean; workArea: boolean };

export type CountPair = {
  /** Finished / actually that profession. */
  have: number;
  /** `have` plus plans, scaffolds, inbound occupy/equip. */
  queued: number;
};

export type BoardContext = {
  selection: BoardSelection;
  counts: Partial<Record<BuildingKind, CountPair>>;
  /** Owned units by profession. */
  units: Partial<Record<string, CountPair>>;
  canCommand: boolean;
  placeTool: PlaceTool | null;
  /** Civilian digger cap, 0–1. */
  diggerRatio: number;
  /** `floor(ratio × civilians)`. Tools badge uses this as the right-hand number. */
  diggerCap: number;
  bricklayerRatio: number;
  /** Same formula as `diggerCap`. */
  bricklayerCap: number;
};
