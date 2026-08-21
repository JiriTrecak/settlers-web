/**
 * View models for `GameControlPanel`. Session fills these; the widget only paints them.
 * 12 slots, row-major, slot 11 = bottom-right of the 4×3.
 */
export const COMMAND_SLOTS = 12;
/** Bottom-right cell of a 4×3. Idle Military / drill Back / hut Cancel. */
export const COMMAND_CORNER = 11;
/** Idle Military. */
export const COMMAND_MILITARY = 11;
/** Idle Food. */
export const COMMAND_FOOD = 10;
/** Idle Production. */
export const COMMAND_PRODUCTION = 9;
/** Idle Tools — left of Production. */
export const COMMAND_TOOLS = 8;
/** Idle Recruit — above Military. */
export const COMMAND_NEAR_CORNER = 7;

export type CommandId = string;

export type CommandSlot = {
  id: CommandId;
  label: string;
  /** Path under `/graphics/`. */
  icon?: string;
  /** Owned-count badge, top-left. With `queued` > `count`, paints `count → queued`. */
  count?: number;
  /** Have + in-flight (plan, scaffold, occupy, equip). Omit when equal to `count`. */
  queued?: number;
  /** Lowercase letter. Current page only — `CommandBoard.key` matches this. */
  hotkey?: string;
  enabled: boolean;
  kind: "do" | "page" | "toggle";
  armed?: boolean;
};

export type CommandPage = {
  id: string;
  slots: (CommandSlot | null)[];
};

export type SelectionView =
  | { type: "none" }
  | { type: "units"; title: string; kinds: { kind: string; count: number }[] }
  | {
      type: "building";
      title: string;
      kind: string;
      state: string;
      icon?: string;
      /** Request / construction piles. */
      needs: GoodsLine[];
      /** Offer piles. */
      produces: GoodsLine[];
    };

/** One goods row on the hut selection pane. `icon` is a path under `/graphics/`. */
export type GoodsLine = {
  material: string;
  have: number;
  max: number;
  icon?: string;
};
