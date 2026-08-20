/**
 * Roman fisher hut. Fisherman pulls fish from nearby water.
 */
import type { BuildingDef } from "../types";

export const fisher = {
  kind: "fisher",
  civ: "roman",
  sheet: "buildings/roman/fisher",
  worker: "fisherman",
  workRadius: 30,
  viewDistance: 0,
  ground: ["grass", "earth", "flattened"],
  blocked: [
    { dx: -1, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: -1, dy: -1 },
    { dx: -1, dy: -2 },
    { dx: 0, dy: -2 },
    { dx: 1, dy: -1 },
    { dx: 2, dy: 2 },
    { dx: 1, dy: 1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: 2 },
    { dx: 1, dy: 3 },
    { dx: 1, dy: 2 },
    { dx: 2, dy: 3 },
    { dx: 2, dy: 0 },
    { dx: -1, dy: 2 }
  ],
  protected: [
    { dx: -1, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: -1, dy: -1 },
    { dx: -1, dy: -2 },
    { dx: 0, dy: -2 },
    { dx: 1, dy: -1 },
    { dx: 2, dy: 2 },
    { dx: 1, dy: 1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: 2 },
    { dx: 1, dy: 3 },
    { dx: 1, dy: 2 },
    { dx: 2, dy: 3 },
    { dx: 2, dy: 0 },
    { dx: -1, dy: 2 },
    { dx: 2, dy: 1 },
    { dx: 0, dy: 3 },
    { dx: 1, dy: 4 },
    { dx: 2, dy: 4 },
    { dx: 3, dy: 4 },
    { dx: 3, dy: 3 },
    { dx: 3, dy: 2 },
    { dx: 3, dy: 1 },
    { dx: -1, dy: -3 },
    { dx: 0, dy: -3 },
    { dx: 2, dy: -1 },
    { dx: 3, dy: 0 },
    { dx: -2, dy: -3 },
    { dx: -2, dy: -2 },
    { dx: -2, dy: -1 },
    { dx: -2, dy: 0 },
    { dx: -2, dy: 1 },
    { dx: -1, dy: 3 },
    { dx: 0, dy: 4 },
    { dx: 1, dy: -2 },
    { dx: -2, dy: 2 }
  ],
  door: { dx: 2, dy: 1 },
  flag: { dx: 1, dy: -2 },
  constructionStacks: [
    { dx: 1, dy: 4, material: "stone", required: 2 },
    { dx: 3, dy: 4, material: "plank", required: 3 }
  ],
  requestStacks: [],
  offerStacks: [
    { dx: 3, dy: 4, material: "fish" }
  ],
  bricklayers: [
    { dx: 3, dy: 2, direction: "nw" },
    { dx: 3, dy: 3, direction: "nw" },
    { dx: 0, dy: 3, direction: "nw" },
    { dx: 1, dy: 4, direction: "ne" }
  ],
  buildMarks: [
    { dx: -1, dy: 2 },
    { dx: -1, dy: 0 },
    { dx: -1, dy: -2 },
    { dx: 2, dy: 0 },
    { dx: 2, dy: 3 }
  ],
} as const satisfies BuildingDef;
