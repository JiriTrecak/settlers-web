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
    expect(parseCatalogue({ v: 1, name: "x", assets: [{ id: "a", name: "A", category: "water", type: "boat", file: "a.gltf" }] })).toBeNull();
  });

  it("mints unique ids", () => {
    expect(assetIdFromName("Forest Pine", new Set())).toBe("forest-pine");
    expect(assetIdFromName("Pine", new Set(["pine"]))).toBe("pine-2");
  });

  it("ships pine in the project catalogue", () => {
    const doc = projectCatalogue();
    expect(doc.assets.some((a) => a.id === "pine" && a.category === "foliage")).toBe(true);
    expect(doc.assets.some((a) => a.id === "pine-dark" && a.category === "foliage")).toBe(true);
    expect(doc.assets.some((a) => a.id === "pine-umber" && a.category === "foliage")).toBe(true);
    expect(doc.assets.some((a) => a.id === "boulder" && a.category === "terrain")).toBe(true);
    expect(doc.assets.some((a) => a.id === "rock" && a.category === "terrain")).toBe(true);
    expect(doc.assets.some((a) => a.id === "rock-cleft" && a.category === "terrain")).toBe(true);
    expect(doc.assets.some((a) => a.id === "rock-slab" && a.category === "terrain")).toBe(true);
    expect(doc.assets.some((a) => a.id === "lily" && a.type === "water" && a.category === "water")).toBe(true);
    expect(doc.assets.some((a) => a.id === "lily-white" && a.type === "water")).toBe(true);
    expect(doc.assets.some((a) => a.id === "lily-gold" && a.type === "water")).toBe(true);
  });

  it("accepts a water listing", () => {
    const doc = {
      v: 1 as const,
      name: "Pack",
      assets: [{ id: "lily", name: "Lily", category: "water" as const, type: "water" as const, file: "props/lily.gltf" }],
    };
    expect(parseCatalogue(JSON.parse(stringifyCatalogue(doc)))).toEqual(doc);
  });
});
