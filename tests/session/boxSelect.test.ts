import { describe, expect, it } from "vitest";
import { idsInMarquee, inBox, isClick, tilesAround } from "../../src/session/input/boxSelect";

describe("marquee", () => {
  it("treats a tiny drag as a click", () => {
    expect(isClick({ x: 10, y: 10 }, { x: 12, y: 11 })).toBe(true);
    expect(isClick({ x: 10, y: 10 }, { x: 20, y: 10 })).toBe(false);
  });

  it("hits inclusive screen rects regardless of drag direction", () => {
    expect(inBox({ x: 5, y: 5 }, { x: 10, y: 10 }, { x: 0, y: 0 })).toBe(true);
    expect(inBox({ x: 11, y: 5 }, { x: 10, y: 10 }, { x: 0, y: 0 })).toBe(false);
  });

  it("picks own controllable outdoor units in the rect", () => {
    const units = [
      { id: 1, pos: { x: 1, y: 1 }, inside: false, player: 0, type: "swordsman" },
      { id: 2, pos: { x: 8, y: 8 }, inside: false, player: 0, type: "swordsman" },
      { id: 3, pos: { x: 2, y: 2 }, inside: false, player: 1, type: "swordsman" },
      { id: 4, pos: { x: 2, y: 1 }, inside: false, player: 0, type: "lumberjack" },
      { id: 5, pos: { x: 1, y: 2 }, inside: true, player: 0, type: "swordsman" },
      { id: 6, pos: { x: 3, y: 1 }, inside: false, player: 0, type: "bearer" },
    ];
    const toScreen = (pos: { x: number; y: number }) => ({ x: pos.x * 10, y: pos.y * 10 });
    expect(idsInMarquee(units, { x: 0, y: 0 }, { x: 35, y: 25 }, 0, toScreen)).toEqual([1]);
  });
});

describe("tilesAround", () => {
  it("is the seed, then hex neighbors", () => {
    expect(tilesAround({ x: 5, y: 5 }, 1)).toEqual([{ x: 5, y: 5 }]);
    const ring = tilesAround({ x: 5, y: 5 }, 7);
    expect(ring[0]).toEqual({ x: 5, y: 5 });
    expect(ring).toHaveLength(7);
    expect(new Set(ring.map((p) => `${p.x},${p.y}`)).size).toBe(7);
  });
});
