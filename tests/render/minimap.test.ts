import { describe, expect, it } from "vitest";
import { ndcToWorld, worldToNdc } from "../../src/render/minimap/minimap";

describe("minimap iso", () => {
  it("roundtrips corners", () => {
    const size = 256;
    for (const [x, z] of [
      [0, 0],
      [size, 0],
      [0, size],
      [size, size],
      [size / 2, size / 2],
    ] as const) {
      const [nx, ny] = worldToNdc(x, z, size);
      const [bx, bz] = ndcToWorld(nx, ny, size);
      expect(bx).toBeCloseTo(x);
      expect(bz).toBeCloseTo(z);
    }
  });

  it("puts the far corner (0,0) at the top — same as the iso view", () => {
    const [, ny] = worldToNdc(0, 0, 256);
    expect(ny).toBeGreaterThan(0);
    const [, fy] = worldToNdc(256, 256, 256);
    expect(fy).toBeLessThan(0);
  });
});
