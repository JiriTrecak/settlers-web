import { describe, expect, it } from "vitest";
import { buildings, findBuildings, originKey, primaryRef } from "../../original_conv/catalog";

describe("building catalog", () => {
  it("has all four civs", () => {
    expect(new Set(buildings.map((b) => b.civ)).size).toBe(4);
    expect(buildings.length).toBeGreaterThan(100);
  });

  it("maps lumberjack to roman file 13 seq 0", () => {
    const hit = findBuildings("roman lumberjack")[0];
    expect(hit?.id).toBe("building/roman/lumberjack");
    expect(primaryRef(hit!)).toEqual({ file: 13, kind: "settler", sequence: 0, frame: 0 });
    expect(originKey(primaryRef(hit!)!)).toBe("original_13_SETTLER_0_0");
  });
});
