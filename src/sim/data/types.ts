/**
 * Shared shape for one-file building / settler defs. The files under
 * `buildings/` and `settlers/` are the data; this is only the type.
 */
import type { Direction, LandscapeType } from "../../shared";

export type Rel = { dx: number; dy: number };

export type DirRel = Rel & { direction: Direction };

/** Goods that sit on stacks. Grow this union as defs need it. */
export type Goods = "trunk" | "plank" | "stone" | "axe" | "hammer" | "blade" | "pick" | "saw";

export type StackSlot = Rel & {
  material: Goods;
  /** Construction stacks only: how many to finish the hut. */
  required?: number;
};

export type BuildingDef = {
  kind: string;
  civ: "roman" | "egyptian" | "asian" | "amazon";
  /** Catalog group `buildings/{civ}/{kind}`. */
  sheet: string;
  worker: string | null;
  workRadius: number;
  viewDistance: number;
  ground: readonly LandscapeType[];
  /** Walk-blocked. */
  blocked: readonly Rel[];
  /** No other building may overlap. Includes `blocked`. */
  protected: readonly Rel[];
  door: Rel;
  flag: Rel;
  constructionStacks: readonly StackSlot[];
  requestStacks: readonly StackSlot[];
  offerStacks: readonly StackSlot[];
  bricklayers: readonly DirRel[];
  buildMarks: readonly Rel[];
  /** Sawmiller (and similar) stand here to work. */
  workSpot?: DirRel;
  /** Livinghouse: max bearers this hut produces. */
  beds?: number;
  /** Livinghouse: ms between spawns. */
  produceMs?: number;
};

export type SettlerDef = {
  kind: string;
  /** Tile step duration at 1×. */
  stepMs: number;
  /** Idle at the hut door between work cycles. */
  restMs?: number;
  /** Axe / work clip length. Falls back to the shared chop duration. */
  chopMs?: number;
  /** Building `kind` this profession works, if any. */
  workplace?: string;
};
