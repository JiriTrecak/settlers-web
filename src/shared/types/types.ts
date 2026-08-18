/** Shared value types. Actions are the only way the session mutates sim. */
export type GridPos = {
  readonly x: number;
  readonly y: number;
};

export type Action =
  | { type: "noop" }
  | { type: "placeColony"; at: GridPos; player?: number; swordsmen?: number }
  | { type: "moveTo"; id: number; to: GridPos; forced?: boolean }
  | { type: "chop"; id: number; at: GridPos }
  | { type: "pickup"; id: number; at: GridPos }
  | { type: "drop"; id: number; at: GridPos }
  | { type: "placeBuilding"; kind: "lumberjack" | "forester" | "stonecutter" | "tower" | "sawmill" | "small_livinghouse"; at: GridPos; player?: number }
  | { type: "occupy"; at: GridPos; player?: number }
  | { type: "destroyBuilding"; at: GridPos }
  | { type: "pioneerWork"; id: number; to: GridPos }
  | { type: "convert"; id: number; to: "pioneer" | "bearer" | "swordsman" };
