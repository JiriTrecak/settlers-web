import { describe, expect, it } from "vitest";
import { Color, Mesh, MeshStandardMaterial } from "three";
import { applyPlayerMaterial, applyPlayerMaterials, TEAM_COLOR_MATERIAL } from "../../src/render/settlement/playerMaterials";

describe("explicit team-color material", () => {
  it("replaces only the tagged color and restores it when unowned", () => {
    const material = new MeshStandardMaterial({color: "#8e3627"});
    material.name = TEAM_COLOR_MATERIAL;
    const original = material.color.clone();
    const blue = new Color("#4080ee");
    applyPlayerMaterial(material, blue);
    expect(material.color.equals(blue)).toBe(true);
    applyPlayerMaterial(material, new Color("#df3030"));
    applyPlayerMaterial(material, blue);
    expect(material.color.equals(blue)).toBe(true);
    const root = new Mesh(undefined, material);
    applyPlayerMaterials(root, -1);
    expect(material.color.equals(original)).toBe(true);
    applyPlayerMaterials(root, 1);
    applyPlayerMaterials(root, -1);
    expect(material.color.equals(original)).toBe(true);
  });
  it("leaves roofs, chitin, ordinary materials and non-exact names unchanged", () => {
    for (const name of ["Ant carapace roof 0", "Ant rust chitin", "Ant chitin planes", "Ant worn steel", "Ant timber 1", "Ant faction red", "UTC Team color", "TC_TeamColor.001", "TC_TeamColor · baked viewer", "tc_teamcolor"]) {
      const material = new MeshStandardMaterial({color: "#987654"});
      material.name = name;
      const original = material.color.clone();
      applyPlayerMaterial(material, new Color("#4080ee"));
      expect(material.color.equals(original)).toBe(true);
    }
  });
});
