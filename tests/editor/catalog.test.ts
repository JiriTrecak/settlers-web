import { describe, expect, it } from "vitest";
import { catalog } from "../../src/editor/assets/catalog";

describe("asset catalog", () => {
  it("picks up pine from assets/props", () => {
    expect(catalog.map((a) => a.id)).toContain("pine");
  });
});
