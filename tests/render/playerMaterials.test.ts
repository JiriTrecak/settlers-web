import { describe, expect, it } from "vitest";
import { Color, Mesh, MeshStandardMaterial, SRGBColorSpace } from "three";
import {
  applyPlayerMaterial,
  applyPlayerMaterials,
} from "../../src/render/settlement/playerMaterials";
const hsl = (color: Color) =>
  color.getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace);

describe("player material palette", () => {
  it("restores the authored faction colors when a reused model becomes unowned", () => {
    for (const name of [
      "Ant faction red",
      "Ant carapace roof 0",
      "Ant rust chitin",
    ]) {
      const material = new MeshStandardMaterial({ color: "#8e3627" });
      material.name = name;
      const root = new Mesh(undefined, material),
        original = material.color.clone();
      applyPlayerMaterials(root, 0);
      expect(material.color.equals(original)).toBe(false);
      applyPlayerMaterials(root, -1);
      expect(material.color.equals(original)).toBe(true);
      applyPlayerMaterials(root, 1);
      applyPlayerMaterials(root, -1);
      expect(material.color.equals(original)).toBe(true);
    }
  });
  it("preserves authored light/dark variation and supports repeat ownership changes", () => {
    for (const [name, color] of [
      ["Ant carapace roof 0", "#8e3627"],
      ["Ant carapace roof 2", "#ba563a"],
      ["Ant rust chitin", "#9f432c"],
      ["Ant chitin planes", "#bb5939"],
    ]) {
      const material = new MeshStandardMaterial({ color });
      material.name = name!;
      const lightness = hsl(material.color).l;
      const blue = new Color("#4080ee");
      applyPlayerMaterial(material, blue);
      expect(hsl(material.color).h).toBeCloseTo(hsl(blue).h);
      expect(hsl(material.color).l).toBeCloseTo(lightness);
      const first = material.color.clone();
      applyPlayerMaterial(material, new Color("#df3030"));
      applyPlayerMaterial(material, blue);
      expect(material.color.equals(first)).toBe(true);
    }
  });
  it("leaves steel, wood, leaves and cargo unchanged", () => {
    for (const name of [
      "Ant worn steel",
      "Ant timber 1",
      "Ant leaf 0",
      "Ant end grain",
    ]) {
      const material = new MeshStandardMaterial({ color: "#987654" });
      material.name = name;
      const original = material.color.clone();
      applyPlayerMaterial(material, new Color("#4080ee"));
      expect(material.color.equals(original)).toBe(true);
    }
  });
});
