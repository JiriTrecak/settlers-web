/**
 * Pause menu screens. Session owns the board; PauseMenu is the DOM.
 */

export type PauseScreen = "closed" | "menu" | "files" | "confirm";
export type PauseMode = "save" | "load";
export type PauseConfirm = "end" | "restart" | "load" | "overwrite";

export type PauseView = {
  screen: PauseScreen;
  mode: PauseMode;
  name: string;
  confirm: PauseConfirm | null;
  saveId: string | null;
};

export const CLOSED_PAUSE: PauseView = {
  screen: "closed",
  mode: "save",
  name: "Save",
  confirm: null,
  saveId: null,
};

export function confirmCopy(kind: PauseConfirm): { title: string; body: string; yes: string } {
  if (kind === "end") return { title: "End this match?", body: "You will leave the game.", yes: "End" };
  if (kind === "restart") return { title: "Restart this match?", body: "The colony is rebuilt from the start.", yes: "Restart" };
  if (kind === "load") return { title: "Load this save?", body: "Unsaved progress in this match is lost.", yes: "Load" };
  return { title: "Overwrite this save?", body: "The previous file is replaced.", yes: "Save" };
}
