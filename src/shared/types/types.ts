/** Shared value types. Actions are the only way the session mutates sim. */
export type GridPos = {
  readonly x: number;
  readonly y: number;
};

export type Action =
  | { type: "noop" }
  | { type: "moveTo"; id: number; to: GridPos }
  | { type: "chop"; id: number; at: GridPos }
  | { type: "pickup"; id: number; at: GridPos }
  | { type: "drop"; id: number; at: GridPos }
  | { type: "placeBuilding"; kind: "lumberjack" | "tower" | "sawmill" | "small_livinghouse"; at: GridPos; player?: number };
