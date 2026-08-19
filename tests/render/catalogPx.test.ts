import { describe, expect, it } from "vitest";
import { catalogPx } from "../../src/render/graphics/textures";

describe("catalogPx", () => {
  it("reads px.json group:variant for the HD tower", () => {
    expect(catalogPx({ path: "other.png", group: "buildings/roman/tower", variant: "built" })).toBe(2);
  });

  it("defaults to 1, catalog px, then overlay", () => {
    expect(catalogPx({ path: "nope.png" })).toBe(1);
    expect(catalogPx({ path: "nope.png", px: 3 })).toBe(3);
    expect(catalogPx({ path: "nope.png", group: "buildings/roman/tower", variant: "built", px: 3 })).toBe(2);
  });
});
