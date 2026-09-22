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

  it("ships only the current woodland scenery families", () => {
    const doc = projectCatalogue();
    for (const id of ["woodland-pine-a", "woodland-pine-b", "woodland-pine-sapling", "woodland-lily-a", "woodland-moss-boulder", "woodland-ruined-watchtower", "woodland-root-arch-bridge", "leafbound-twig-bridge"]) {
      expect(doc.assets.some(a => a.id === id), id).toBe(true);
    }
    expect(doc.assets.some(a => a.id.startsWith("synty-") || a.id === "pine")).toBe(false);
    expect(doc.assets.some(a => a.id === "woodland-amber-lantern" && a.light)).toBe(true);
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
