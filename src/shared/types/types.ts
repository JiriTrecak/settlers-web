/** Shared value types. Actions are the only way the session mutates sim. */
export type GridPos = {
  readonly x: number;
  readonly y: number;
};

export type Action =
  | { type: "noop" }
  | { type: "placeColony"; at: GridPos; player?: number }
  | { type: "moveTo"; id: number; to: GridPos; forced?: boolean }
  | { type: "chop"; id: number; at: GridPos }
  | { type: "pickup"; id: number; at: GridPos }
  | { type: "drop"; id: number; at: GridPos }
  | { type: "placeBuilding"; kind: "lumberjack" | "forester" | "stonecutter" | "tower" | "sawmill" | "small_livinghouse" | "ironmine" | "goldmine" | "farm" | "mill" | "baker" | "fisher" | "pig_farm" | "slaughterhouse" | "waterworks"; at: GridPos; player?: number }
  | { type: "occupy"; at: GridPos; player?: number }
  | { type: "destroyBuilding"; at: GridPos }
  | { type: "pioneerWork"; id: number; to: GridPos }
  | { type: "geologistWork"; id: number; to: GridPos }
  | { type: "convert"; id: number; to: "pioneer" | "bearer" | "swordsman" | "geologist" }
  /** Debug dump from the Units strip. Not a barracks. */
  | { type: "spawnUnit"; kind: "swordsman"; at: GridPos; player?: number; count?: number }
  | { type: "setDiggerRatio"; ratio: number; player?: number }
  | { type: "setBricklayerRatio"; ratio: number; player?: number }
  /** Move an outdoor hut's search circle. `at` is the hut origin; `center` is the new work origin. Radius stays `def.workRadius`. */
  | { type: "setWorkArea"; at: GridPos; center: GridPos };
