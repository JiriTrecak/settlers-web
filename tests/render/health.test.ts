import { describe, expect, it } from "vitest";
import { healthFrameIndex } from "../../src/render/settler/settlerLayer";

describe("healthFrameIndex", () => {
  it("is frame 0 at full HP and last when empty", () => {
    expect(healthFrameIndex(100, 100, 8)).toBe(0);
    expect(healthFrameIndex(0, 100, 8)).toBe(7);
  });

  it("steps through the sequence as HP drops", () => {
    expect(healthFrameIndex(88, 100, 8)).toBe(0);
    expect(healthFrameIndex(87, 100, 8)).toBe(1);
    expect(healthFrameIndex(50, 100, 8)).toBe(4);
  });

  it("clamps overheal and missing max", () => {
    expect(healthFrameIndex(200, 100, 8)).toBe(0);
    expect(healthFrameIndex(50, 0, 8)).toBe(7);
    expect(healthFrameIndex(50, 100, 0)).toBe(0);
  });
});
