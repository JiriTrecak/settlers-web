import { describe, expect, it } from "vitest";
import { ALPHA_MIN, aabbOverlap, localHits } from "../../src/render/settler/spriteHit";

describe("localHits", () => {
  it("uses the texture rectangle when alpha is missing", () => {
    expect(localHits(0, 0, 8, 16, null)).toBe(true);
    expect(localHits(7.9, 15.9, 8, 16, null)).toBe(true);
    expect(localHits(-0.1, 0, 8, 16, null)).toBe(false);
    expect(localHits(8, 0, 8, 16, null)).toBe(false);
  });

  it("rejects transparent texels", () => {
    const a = new Uint8Array(4);
    a[0] = 255;
    a[1] = ALPHA_MIN;
    a[2] = ALPHA_MIN + 1;
    expect(localHits(0, 0, 2, 2, a)).toBe(true);
    expect(localHits(1, 0, 2, 2, a)).toBe(false);
    expect(localHits(0, 1, 2, 2, a)).toBe(true);
  });
});

describe("aabbOverlap", () => {
  it("hits overlapping axis-aligned rects", () => {
    expect(aabbOverlap(0, 0, 10, 10, 5, 5, 15, 15)).toBe(true);
    expect(aabbOverlap(10, 10, 0, 0, 15, 15, 5, 5)).toBe(true);
    expect(aabbOverlap(0, 0, 4, 4, 4, 0, 8, 4)).toBe(false);
    expect(aabbOverlap(0, 0, 4, 4, 5, 0, 8, 4)).toBe(false);
  });
});
