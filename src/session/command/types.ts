/**
 * Session-side command board context. The widget never sees this — only `CommandPage`.
 */
import type { BuildingKind } from "../../sim/data/buildings";

export type PlaceTool =
  | { type: "building"; kind: BuildingKind }
  | { type: "unit"; kind: "swordsman"; count: number };

export type BoardSelection =
  | { type: "none" }
  | { type: "units"; types: string[] }
  | { type: "building"; kind: BuildingKind; state: string };

export type BoardContext = {
  selection: BoardSelection;
  counts: Partial<Record<BuildingKind, number>>;
  /** Owned units by profession. */
  units: Partial<Record<string, number>>;
  canCommand: boolean;
  placeTool: PlaceTool | null;
};
