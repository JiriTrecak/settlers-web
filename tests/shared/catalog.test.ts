import { describe, expect, it } from "vitest";
import { assetIdFromName, parseCatalogue, sitAllowed, stringifyCatalogue } from "../../src/shared";
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
    expect(doc.assets.some((a) => a.id === "river-rock-1" && a.category === "terrain" && a.type === "ground")).toBe(true);
    expect(doc.assets.some((a) => a.id === "lily" && a.type === "water" && a.category === "water")).toBe(true);
    expect(doc.assets.some((a) => a.id === "lily-white" && a.type === "water")).toBe(true);
    expect(doc.assets.some((a) => a.id === "lily-gold" && a.type === "water")).toBe(true);
    expect(doc.assets.some((a) => a.id === "bridge-8" && a.type === "span")).toBe(true);
    expect(doc.assets.some((a) => a.id === "bridge-16" && a.type === "span")).toBe(true);
    expect(doc.assets.some((a) => a.id === "bridge-32" && a.type === "span")).toBe(true);
    const synty = doc.assets.filter((a) => a.id.startsWith("synty-"));
    expect(synty.length).toBeGreaterThan(30);
    expect(synty.length).toBeLessThan(197);
    expect(doc.assets.some((a) => a.id.includes("cloud"))).toBe(false);
    expect(doc.assets.some((a) => a.id === "synty-plant-lillypad-large-01" && a.type === "water")).toBe(true);
    expect(doc.assets.some((a) => a.id === "synty-plant-reeds-01" && a.type === "water")).toBe(true);
    expect(doc.assets.some((a) => a.id === "synty-prop-bridge-curved-01" && a.type === "span")).toBe(true);
    expect(doc.assets.some((a) => a.id === "synty-tree-pine-01" && a.type === "prop" && a.category === "foliage")).toBe(true);
  });

  it("sits water on wet and props on dry", () => {
    expect(sitAllowed("water", true)).toBe(true);
    expect(sitAllowed("water", false)).toBe(false);
    expect(sitAllowed("prop", false)).toBe(true);
    expect(sitAllowed("prop", true)).toBe(false);
    expect(sitAllowed("span", true)).toBe(true);
    expect(sitAllowed("span", false)).toBe(true);
    expect(sitAllowed("ground", true)).toBe(true);
    expect(sitAllowed("ground", false)).toBe(true);
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
