import { describe, expect, it } from "vitest";
import { constructionVisual } from "../../src/render/building/constructionVisual";

describe("constructionVisual", () => {
  it("is fence until the first hammer", () => {
    expect(constructionVisual(0)).toEqual({ fence: true, scaffold: 0, built: 0 });
    expect(constructionVisual(0.009)).toMatchObject({ fence: true });
  });

  it("grows the scaffold through the first half, then the hut", () => {
    const early = constructionVisual(0.25);
    expect(early.fence).toBe(false);
    expect(early.scaffold).toBeCloseTo(0.5);
    expect(early.built).toBe(0);

    const mid = constructionVisual(0.5);
    expect(mid.scaffold).toBe(1);
    expect(mid.built).toBe(0);

    const late = constructionVisual(0.75);
    expect(late.scaffold).toBe(1);
    expect(late.built).toBeCloseTo(0.5);
  });

  it("is the finished hut at the end", () => {
    expect(constructionVisual(0.99)).toEqual({ fence: false, scaffold: 0, built: 1 });
    expect(constructionVisual(1)).toEqual({ fence: false, scaffold: 0, built: 1 });
  });
});
