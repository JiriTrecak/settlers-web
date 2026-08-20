/** F10 pause stack: menu / shared save-load list / confirms. */
import { describe, expect, it } from "vitest";
import { PauseBoard } from "../../src/session/pause/board";
import { confirmCopy } from "../../src/ui/pause/types";

describe("pause board", () => {
  it("F10 opens the menu and F10 again closes it from any screen", () => {
    const b = new PauseBoard();
    expect(b.open).toBe(false);
    b.toggle();
    expect(b.current.screen).toBe("menu");
    b.openSave("Colony");
    expect(b.current.screen).toBe("files");
    b.toggle();
    expect(b.open).toBe(false);
  });

  it("Save and Load share the files screen", () => {
    const b = new PauseBoard();
    b.toggle();
    b.openSave("Coast");
    expect(b.current).toMatchObject({ screen: "files", mode: "save", name: "Coast" });
    b.back();
    b.openLoad();
    expect(b.current).toMatchObject({ screen: "files", mode: "load" });
  });

  it("End / Restart / Load require confirm before the verb", () => {
    const b = new PauseBoard();
    b.toggle();
    b.askEnd();
    expect(b.current.confirm).toBe("end");
    expect(b.confirm()).toEqual({ type: "end" });
    expect(b.open).toBe(false);

    b.toggle();
    b.askRestart();
    expect(b.confirm()).toEqual({ type: "restart" });

    b.toggle();
    b.openLoad();
    b.pick("s1", "Slot");
    expect(b.current).toMatchObject({ screen: "confirm", confirm: "load", saveId: "s1" });
    expect(b.confirm()).toEqual({ type: "load", id: "s1" });
    expect(b.open).toBe(false);
  });

  it("cancel confirm returns to the previous screen", () => {
    const b = new PauseBoard();
    b.toggle();
    b.askEnd();
    b.cancelConfirm();
    expect(b.current.screen).toBe("menu");
    b.openLoad();
    b.pick("s1", "Slot");
    b.cancelConfirm();
    expect(b.current).toMatchObject({ screen: "files", mode: "load" });
  });

  it("new save writes immediately; same name asks overwrite", () => {
    const b = new PauseBoard();
    b.toggle();
    b.openSave("Dawn");
    expect(b.submitSave(false)).toEqual({ type: "save", name: "Dawn" });
    expect(b.open).toBe(false);

    b.toggle();
    b.openSave("Dawn");
    expect(b.submitSave(true)).toEqual({ type: "idle" });
    expect(b.current.confirm).toBe("overwrite");
    expect(b.confirm()).toEqual({ type: "save", name: "Dawn" });
  });

  it("empty name does not save", () => {
    const b = new PauseBoard();
    b.toggle();
    b.openSave("x");
    b.setName("   ");
    expect(b.submitSave(false)).toEqual({ type: "idle" });
    expect(b.current.screen).toBe("files");
  });

  it("save-list pick fills the name for overwrite", () => {
    const b = new PauseBoard();
    b.toggle();
    b.openSave("New");
    b.pick("s1", "Old slot");
    expect(b.current).toMatchObject({ screen: "files", mode: "save", name: "Old slot", saveId: "s1" });
  });

  it("back pops files → menu → closed", () => {
    const b = new PauseBoard();
    b.toggle();
    b.openLoad();
    expect(b.back()).toBe(true);
    expect(b.current.screen).toBe("menu");
    expect(b.back()).toBe(false);
    expect(b.open).toBe(false);
  });

  it("confirm copy covers every action", () => {
    expect(confirmCopy("end").yes).toBe("End");
    expect(confirmCopy("restart").yes).toBe("Restart");
    expect(confirmCopy("load").yes).toBe("Load");
    expect(confirmCopy("overwrite").yes).toBe("Save");
  });
});
