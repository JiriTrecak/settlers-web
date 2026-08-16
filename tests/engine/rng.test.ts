import { describe, expect, it } from "vitest";
import { seedRng } from "../../src/sim/rng";

describe("rng", () => {
  it("same seed produces the same sequence", () => {
    const a = seedRng(1);
    const b = seedRng(1);
    const seqA = Array.from({ length: 16 }, () => a.nextFloat());
    const seqB = Array.from({ length: 16 }, () => b.nextFloat());
    expect(seqA).toEqual(seqB);
  });

  it("does not call Math.random", () => {
    const original = Math.random;
    let called = false;
    Math.random = () => {
      called = true;
      return 0;
    };
    try {
      const rng = seedRng(42);
      rng.nextFloat();
      rng.nextInt(10);
      expect(called).toBe(false);
    } finally {
      Math.random = original;
    }
  });
});
