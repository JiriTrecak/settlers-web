/**
 * Roman mill. Requests crop, offers flour.
 */
import type { BuildingDef } from "../types";

export const mill = {
  kind: "mill",
  civ: "roman",
  sheet: "buildings/roman/mill",
  worker: "miller",
  workRadius: 0,
  viewDistance: 0,
  ground: ["grass", "earth", "flattened"],
  blocked: [
    { dx: 1, dy: 1 },
    { dx: 1, dy: 2 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: 2 },
    { dx: -2, dy: 0 },
    { dx: -2, dy: -1 },
    { dx: -1, dy: -1 },
    { dx: -1, dy: -2 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -2 },
    { dx: 0, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: -2, dy: -2 }
  ],
  protected: [
    { dx: 1, dy: 1 },
    { dx: 1, dy: 2 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: 2 },
    { dx: -2, dy: 0 },
    { dx: -2, dy: -1 },
    { dx: -1, dy: -1 },
    { dx: -1, dy: -2 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -2 },
    { dx: 0, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: -2, dy: -2 },
    { dx: -1, dy: 1 },
    { dx: -3, dy: -1 },
    { dx: -2, dy: 1 },
    { dx: -1, dy: 2 },
    { dx: 0, dy: 3 },
    { dx: 1, dy: 4 },
    { dx: 1, dy: 3 },
    { dx: 2, dy: 4 },
    { dx: 2, dy: 3 },
    { dx: 2, dy: 2 },
    { dx: 2, dy: 1 },
    { dx: 2, dy: 0 },
    { dx: 2, dy: -1 },
    { dx: 1, dy: -2 },
    { dx: 0, dy: -3 },
    { dx: -1, dy: -3 },
    { dx: -2, dy: -3 },
    { dx: -3, dy: -2 },
    { dx: -3, dy: -3 },
    { dx: -3, dy: 0 }
  ],
  door: { dx: -1, dy: 1 },
  flag: { dx: -2, dy: -1 },
  constructionStacks: [
    { dx: 0, dy: 3, material: "plank", required: 3 },
    { dx: 2, dy: 3, material: "stone", required: 3 }
  ],
  requestStacks: [
    { dx: 2, dy: 2, material: "crop" }
  ],
  offerStacks: [
    { dx: -2, dy: 1, material: "flour" }
  ],
  bricklayers: [
    { dx: -2, dy: 1, direction: "ne" },
    { dx: -1, dy: 2, direction: "ne" },
    { dx: 2, dy: 0, direction: "nw" },
    { dx: 2, dy: 1, direction: "nw" },
    { dx: 2, dy: 2, direction: "nw" }
  ],
  buildMarks: [
    { dx: 1, dy: 2 },
    { dx: 0, dy: 2 },
    { dx: -2, dy: 0 },
    { dx: -1, dy: -2 },
    { dx: 1, dy: -1 },
    { dx: -2, dy: -1 },
    { dx: -2, dy: -2 }
  ],
} as const satisfies BuildingDef;
