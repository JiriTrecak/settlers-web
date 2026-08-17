import { describe, expect, it } from "vitest";
import type { LandscapeType } from "../../src/shared/landscape/landscape";
import { isDumpedMap, startForPlayer, startsFromDumpedMap } from "../../src/sim/map/dumpedMap";

describe("startForPlayer", () => {
  it("uses the matching slot, else slot 0", () => {
    const starts = [
      { x: 10, y: 11 },
      { x: 20, y: 21 },
    ];
    expect(startForPlayer(starts, 1)).toEqual({ x: 20, y: 21 });
    expect(startForPlayer(starts, 7)).toEqual({ x: 10, y: 11 });
    expect(startForPlayer([], 0)).toBeUndefined();
    expect(startForPlayer(undefined, 0)).toBeUndefined();
  });
});

describe("startsFromDumpedMap", () => {
  it("accepts dumps that omit starts", () => {
    const map = {
      width: 2,
      heights: [0, 0, 0, 0],
      landscape: ["grass", "grass", "grass", "grass"] satisfies LandscapeType[],
      trees: [],
      stones: [],
    };
    expect(isDumpedMap(map)).toBe(true);
    expect(startsFromDumpedMap(map)).toEqual([]);
  });
});
