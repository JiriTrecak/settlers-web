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
  /** Finished building stamps a tower-radius occupy disk while garrisoned (HQ / military). */
  occupies?: boolean;
  /** Infantry slots. Land stamps while at least one soldier is inside. Omit → 0. */
  garrison?: number;
  /**
   * Diggers level `protected` to the integer mean height before bricklayers.
   * Already-level plots skip. Omit → flatten. `false` skips (mines).
   */
  flatten?: boolean;
};

export type SettlerDef = {
  kind: string;
  /** Tile step duration at 1×. */
  stepMs: number;
  /** Idle inside the hut between work cycles. */
  restMs?: number;
  /** Axe / work clip length. Falls back to the shared chop duration. */
  chopMs?: number;
  /** Last this many ms of `chopMs` play the tree-fall clip. */
  fallMs?: number;
  /** Building `kind` this profession works, if any. */
  workplace?: string;
  /**
   * Path and flock stay on own land. Default true (every civilian).
   * Pioneer / thief / geologist / soldiers set `false`.
   */
  needsPlayersGround?: boolean;
  /** Look radius for fog. Omit → 8. Donkey would be 0. */
  viewDistance?: number;
  /** Soldiers / pioneer / thief. Omit → not a combat target. */
  attackable?: boolean;
  /** Click-to-command. Omit → not selectable (bearers / workers). */
  controllable?: boolean;
  /** Max HP. Omit → 100. */
  health?: number;
  /** Damage per connected swing. Omit → 0. */
  strength?: number;
  /** Aggro disk. Soldiers 30. */
  searchRadius?: number;
  /** Hexes at which a swing connects. Melee 1. */
  attackRange?: number;
  /** Catalog folder under `settlers/{civ}/`. Omit → `kind`. */
  sheet?: string;
};
