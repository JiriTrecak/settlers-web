import { describe, expect, it } from "vitest";
import { parseBootIntent } from "../../src/app/game/bootIntent";

describe("parseBootIntent", () => {
  it("defaults to the main menu", () => {
    expect(parseBootIntent("")).toEqual({ kind: "menu" });
    expect(parseBootIntent("?")).toEqual({ kind: "menu" });
  });

  it("skips to a match via ?map=", () => {
    expect(parseBootIntent("?map=coast")).toEqual({ kind: "play", mapId: "coast" });
  });

  it("opens map select via ?screen=single", () => {
    expect(parseBootIntent("?screen=single")).toEqual({ kind: "single" });
  });

  it("prefers ?map= over ?screen=", () => {
    expect(parseBootIntent("?screen=single&map=peak")).toEqual({ kind: "play", mapId: "peak" });
  });
});
