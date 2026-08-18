import { describe, expect, it } from "vitest";
import type { LandscapeType } from "../../src/shared/landscape/landscape";
import { isDumpedMap, matchStarts, mapStartCap, clampMatchPlayers, startForPlayer, startsFromDumpedMap } from "../../src/sim/map/dumpedMap";

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

describe("clampMatchPlayers", () => {
  it("caps to the dump slot count and at least 1", () => {
    expect(clampMatchPlayers(8, 4)).toBe(4);
    expect(clampMatchPlayers(0, 4)).toBe(1);
    expect(clampMatchPlayers(3, 8)).toBe(3);
    expect(clampMatchPlayers(99, 99)).toBe(8);
  });
});

describe("mapStartCap", () => {
  it("uses dump starts; empty starts allow at most a 2p opposite pair", () => {
    expect(mapStartCap(4, 8)).toBe(4);
    expect(mapStartCap(0, 8)).toBe(2);
    expect(mapStartCap(0, 1)).toBe(1);
  });
});

describe("matchStarts", () => {
  it("keeps dump slots and synthesizes missing ones opposite, not stacked", () => {
    expect(matchStarts([{ x: 10, y: 11 }, { x: 20, y: 21 }], 2, { width: 100, height: 80 })).toEqual([
      { x: 10, y: 11 },
      { x: 20, y: 21 },
    ]);
    expect(matchStarts([], 2, { width: 100, height: 80 })).toEqual([
      { x: 50, y: 40 },
      { x: 49, y: 39 },
    ]);
    expect(matchStarts([{ x: 10, y: 11 }, { x: 20, y: 21 }], 8, { width: 100, height: 80 })).toHaveLength(2);
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
