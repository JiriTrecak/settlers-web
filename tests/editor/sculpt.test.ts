import { describe, expect, it } from "vitest";
import { HeightField } from "../../src/shared";
import { SculptTool } from "../../src/editor/sculpt/sculpt";

describe("sculpt", () => {
  it("raises then shift-lowers a disc", () => {
    const field = new HeightField();
    const tool = new SculptTool();
    tool.setStrength(0.8);
    tool.beginStroke();
    expect(tool.stroke(12, 12, false, field)).not.toBeNull();
    const up = field.sample(12, 12);
    expect(up).toBeGreaterThan(0.4);
    tool.beginStroke();
    tool.stroke(12, 12, true, field);
    expect(field.sample(12, 12)).toBeLessThan(up);
  });

  it("cuts a basin from a painted water mask", () => {
    const field = new HeightField();
    const tool = new SculptTool();
    tool.setMode("water");
    tool.setStrength(1);
    tool.beginStroke();
    tool.stroke(20, 20, false, field);
    expect(field.sample(20, 20)).toBe(0);
    expect(tool.applyWater(field)).not.toBeNull();
    expect(field.sample(20, 20)).toBeLessThan(0);
    expect(field.wet(20, 20)).toBe(true);
    expect(tool.mask.any()).toBe(false);
  });
});
