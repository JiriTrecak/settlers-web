/**
 * View models for `GameControlPanel`. Session fills these; the widget only paints them.
 * 12 slots, row-major, slot 11 = bottom-right of the 4×3.
 */
export const COMMAND_SLOTS = 12;
/** Bottom-right cell of a 4×3. */
export const COMMAND_CORNER = 11;
/** Left of Build on the bottom row. */
export const COMMAND_NEAR_CORNER = 10;

export type CommandId = string;

export type CommandSlot = {
  id: CommandId;
  label: string;
  /** Path under `/graphics/`. */
  icon?: string;
  /** Owned-count badge, top-right. */
  count?: number;
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
  | { type: "building"; title: string; kind: string; state: string; icon?: string };
