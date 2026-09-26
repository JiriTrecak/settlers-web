import { describe, expect, it } from "vitest";
import { Color, Mesh, MeshStandardMaterial, Texture } from "three";
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

it('recolors masked pixels in independent instances, preserving opacity and existing shader hooks', () => {
  const prototype = new MeshStandardMaterial();
  prototype.name = TEAM_COLOR_MATERIAL;
  prototype.userData = {teamColorMask:'baseColorAlpha', teamColorSourceMax:.6, teamColorDefault:[.02,.12,.6]};
  prototype.map = new Texture();
  const first = prototype.clone(), second = prototype.clone();
  let priorCalls = 0;
  first.onBeforeCompile = shader => {priorCalls++;shader.fragmentShader += '\n// fog hook retained';};
  applyPlayerMaterial(first,new Color('#ff0000'));
  applyPlayerMaterial(second,new Color('#0000ff'));
  const shader={fragmentShader:'#include <map_fragment>\n#include <color_fragment>',uniforms:{}};
  first.onBeforeCompile(shader as any, {} as any);
  expect(priorCalls).toBe(1);
  expect(shader.fragmentShader).toContain('mix(ownershipSample.rgb');
  expect(shader.fragmentShader).toContain('ownershipSample.a');
  expect(shader.fragmentShader).not.toContain('diffuseColor.a *=');
  expect(shader.fragmentShader).toContain('// fog hook retained');
  expect(shader.fragmentShader).toContain('#include <color_fragment>');
  expect(first.color.getHexString()).toBe('ff0000');
  expect(second.color.getHexString()).toBe('0000ff');
  expect(prototype.color.getHexString()).toBe('ffffff');
  expect(first.map).toBe(second.map);
  const hook=first.onBeforeCompile;
  applyPlayerMaterial(first,new Color('#00ff00'));
  expect(first.onBeforeCompile).toBe(hook);
  applyPlayerMaterials(new Mesh(undefined,first),-1);
  expect(first.color.toArray()).toEqual([.02,.12,.6]);
});
