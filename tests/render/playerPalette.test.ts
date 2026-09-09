import { expect, it } from "vitest";
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from "three";
import { playerCss, playerRgb } from "../../src/shared/player/player";
import { applyPlayerMaterials, TEAM_COLOR_MATERIAL } from "../../src/render/settlement/playerMaterials";
it("uses the requested slot order consistently for UI and model materials", () => {
  const colors = ["a04b31", "2878df", "34a853", "f2cf35", "ed842a", "9656cf", "36cbd0", "eeeeee"];
  const root = new Group(), material = new MeshStandardMaterial({color: 0xa04b31});
  material.name = TEAM_COLOR_MATERIAL;
  const geometry = new BoxGeometry();
  root.add(new Mesh(geometry, material));
  colors.forEach((hex, slot) => {
    expect(playerCss(slot)).toBe("#" + hex);
    expect(playerRgb(slot)).toEqual([0, 2, 4].map(start => parseInt(hex.slice(start, start + 2), 16)));
    applyPlayerMaterials(root, slot);
    expect(material.color.getHexString()).toBe(hex);
  });
  applyPlayerMaterials(root, -1);
  expect(material.color.getHexString()).toBe("a04b31");
  geometry.dispose(); material.dispose();
});
