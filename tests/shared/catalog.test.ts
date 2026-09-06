import { describe, expect, it } from "vitest";
import { assetIdFromName, parseCatalogue, stringifyCatalogue } from "../../src/shared";
import { projectCatalogue } from "../../src/editor/assets/project";

describe("catalogue", () => {
  it("roundtrips a listing", () => {
    const doc = {
      v: 1 as const,
      name: "Pack",
      assets: [{ id: "pine", name: "Pine", category: "foliage" as const, type: "prop" as const, file: "props/pine.gltf" }],
    };
    expect(parseCatalogue(JSON.parse(stringifyCatalogue(doc)))).toEqual(doc);
  });

  it("rejects bad docs", () => {
    expect(parseCatalogue(null)).toBeNull();
    expect(parseCatalogue({ v: 1, name: "x" })).toBeNull();
    expect(parseCatalogue({ v: 1, name: "x", assets: [{ id: "a", name: "A", category: "nope", type: "prop", file: "a.gltf" }] })).toBeNull();
  });

  it("mints unique ids", () => {
    expect(assetIdFromName("Forest Pine", new Set())).toBe("forest-pine");
    expect(assetIdFromName("Pine", new Set(["pine"]))).toBe("pine-2");
  });

  it("ships pine in the project catalogue", () => {
    const doc = projectCatalogue();
    expect(doc.assets.some((a) => a.id === "pine" && a.category === "foliage")).toBe(true);
    expect(doc.assets.some((a) => a.id === "boulder" && a.category === "terrain")).toBe(true);
  });
});
