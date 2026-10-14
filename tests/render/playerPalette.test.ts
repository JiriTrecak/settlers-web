import { expect, it } from "vitest";
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from "three";
import { PLAYER_COLORS, playerCss, playerRgb } from "../../src/shared/player/player";
import { applyPlayerMaterials, TEAM_COLOR_MATERIAL } from "../../src/render/settlement/playerMaterials";

/** Maps place up to eight players (start locations accept players 1..8). */
const MAX_PLAYERS = 8;

it("gives every supported player a distinct colour, including white", () => {
  expect(PLAYER_COLORS).toHaveLength(MAX_PLAYERS);
  const css = Array.from({length: MAX_PLAYERS}, (_, slot) => playerCss(slot));
  expect(new Set(css).size).toBe(MAX_PLAYERS);
  expect(css).toContain("#ffffff");
});

it("uses the same slot colour for UI swatches and team-colour model materials", () => {
  const root = new Group(), material = new MeshStandardMaterial({color: 0xa04b31});
  material.name = TEAM_COLOR_MATERIAL;
  const geometry = new BoxGeometry();
  root.add(new Mesh(geometry, material));
  for (let slot = 0; slot < MAX_PLAYERS; slot++) {
    const hex = playerCss(slot).slice(1);
    expect(playerRgb(slot)).toEqual([0, 2, 4].map(start => parseInt(hex.slice(start, start + 2), 16)));
    applyPlayerMaterials(root, slot);
    expect(material.color.getHexString()).toBe(hex);
  }
  applyPlayerMaterials(root, -1);
  expect(material.color.getHexString()).toBe("a04b31");
  geometry.dispose(); material.dispose();
});
