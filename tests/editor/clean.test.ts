import { describe, expect, it } from "vitest";
import { CleanTool, wipeStamps } from "../../src/editor/clean/clean";

describe("clean", () => {
  it("wipes stamps inside the disc and keeps the rest", () => {
    const stamps = [
      { id: "a", asset: "pine", x: 10, y: 10 },
      { id: "b", asset: "pine", x: 10.2, y: 10.1 },
      { id: "c", asset: "rock", x: 20, y: 20 },
    ];
    const next = wipeStamps(stamps, [{ x: 10.5, z: 10.5 }], 2, "objects");
    expect(next.map((s) => s.id)).toEqual(["c"]);
  });

  it("leaves stamps alone when type is foliage", () => {
    const stamps = [{ id: "a", asset: "pine", x: 10, y: 10 }];
    expect(wipeStamps(stamps, [{ x: 10.5, z: 10.5 }], 4, "foliage")).toEqual(stamps);
  });

  it("interpolates a stroke so a skip still hits", () => {
    const tool = new CleanTool();
    tool.setRadius(2);
    const stamps = [
      { id: "a", asset: "pine", x: 5, y: 5 },
      { id: "b", asset: "pine", x: 8, y: 5 },
    ];
    tool.beginStroke();
    expect(tool.stroke(5.5, 5.5, stamps)).toHaveLength(1);
    const mid = tool.stroke(8.5, 5.5, stamps.filter((s) => s.id !== "a"));
    expect(mid?.map((s) => s.id) ?? []).toEqual([]);
  });
});
