/**
 * F10 stack: menu → save/load files → confirm. Session runs verbs; this is the table.
 */
import { CLOSED_PAUSE, type PauseView } from "../../ui/pause/types";

export type PauseCommand =
  | { type: "idle" }
  | { type: "save"; name: string }
  | { type: "load"; id: string }
  | { type: "end" }
  | { type: "restart" };

export class PauseBoard {
  private view: PauseView = { ...CLOSED_PAUSE };

  get open(): boolean {
    return this.view.screen !== "closed";
  }

  get current(): PauseView {
    return this.view;
  }

  /** F10: open the root menu, or close the whole stack. */
  toggle(): void {
    if (this.open) this.close();
    else this.view = { ...CLOSED_PAUSE, screen: "menu" };
  }

  close(): void {
    this.view = { ...CLOSED_PAUSE, name: this.view.name };
  }

  /** Pop one screen. False means the menu closed. */
  back(): boolean {
    if (this.view.screen === "confirm") {
      if (this.view.confirm === "load" || this.view.confirm === "overwrite") {
        this.view = { ...this.view, screen: "files", confirm: null, saveId: this.view.confirm === "load" ? null : this.view.saveId };
        return true;
      }
      this.view = { ...this.view, screen: "menu", confirm: null, saveId: null };
      return true;
    }
    if (this.view.screen === "files") {
      this.view = { ...this.view, screen: "menu", confirm: null, saveId: null };
      return true;
    }
    if (this.view.screen === "menu") {
      this.close();
      return false;
    }
    return false;
  }

  openSave(defaultName?: string): void {
    this.view = {
      screen: "files",
      mode: "save",
      name: defaultName?.trim() || this.view.name || "Save",
      confirm: null,
      saveId: null,
    };
  }

  openLoad(): void {
    this.view = { ...this.view, screen: "files", mode: "load", confirm: null, saveId: null };
  }

  askEnd(): void {
    this.view = { ...this.view, screen: "confirm", confirm: "end", saveId: null };
  }

  askRestart(): void {
    this.view = { ...this.view, screen: "confirm", confirm: "restart", saveId: null };
  }

  setName(name: string): void {
    this.view = { ...this.view, name };
  }

  /** Load list click, or save-list click that fills the name. */
  pick(id: string, name: string): void {
    if (this.view.screen !== "files") return;
    if (this.view.mode === "load") {
      this.view = { ...this.view, screen: "confirm", confirm: "load", saveId: id, name };
      return;
    }
    this.view = { ...this.view, name, saveId: id };
  }

  /** Save button. `exists` is true when this name already has a file. */
  submitSave(exists: boolean): PauseCommand {
    if (this.view.screen !== "files" || this.view.mode !== "save") return { type: "idle" };
    const name = this.view.name.trim();
    if (!name) return { type: "idle" };
    if (exists) {
      this.view = { ...this.view, screen: "confirm", confirm: "overwrite" };
      return { type: "idle" };
    }
    this.close();
    return { type: "save", name };
  }

  confirm(): PauseCommand {
    if (this.view.screen !== "confirm" || !this.view.confirm) return { type: "idle" };
    const action = this.view.confirm;
    const id = this.view.saveId;
    const name = this.view.name.trim();
    this.close();
    if (action === "end") return { type: "end" };
    if (action === "restart") return { type: "restart" };
    if (action === "load" && id) return { type: "load", id };
    if (action === "overwrite" && name) return { type: "save", name };
    return { type: "idle" };
  }

  cancelConfirm(): void {
    if (this.view.screen !== "confirm") return;
    this.back();
  }
}
