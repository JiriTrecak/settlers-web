import { describe, expect, it } from "vitest";
import { parseBootIntent } from "../../src/app/game/bootIntent";

describe("parseBootIntent", () => {
  it("defaults to the main menu", () => {
    expect(parseBootIntent("")).toEqual({ kind: "menu" });
    expect(parseBootIntent("?")).toEqual({ kind: "menu" });
  });

  it("skips to a match via ?map=", () => {
    expect(parseBootIntent("?map=grid")).toEqual({ kind: "play", mapId: "grid" });
    expect(parseBootIntent("?map=coast")).toEqual({ kind: "play", mapId: "coast" });
  });

  it("opens the world editor via ?screen=editor", () => {
    expect(parseBootIntent("?screen=editor")).toEqual({ kind: "editor" });
  });

  it("opens map select via ?screen=single", () => {
    expect(parseBootIntent("?screen=single")).toEqual({ kind: "single" });
  });

  it("reads ?color= as player tint", () => {
    expect(parseBootIntent("?map=coast&color=3")).toEqual({ kind: "play", mapId: "coast", player: 3 });
    expect(parseBootIntent("?color=99").player).toBe(7);
  });

  it("prefers ?map= over ?screen=", () => {
    expect(parseBootIntent("?screen=single&map=peak")).toEqual({ kind: "play", mapId: "peak" });
    expect(parseBootIntent("?screen=editor&map=grid")).toEqual({ kind: "play", mapId: "grid" });
  });
});
