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
});
