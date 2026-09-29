/**
 * Shadow depth materials per fixed caster kind. WebGLShadowMap draws every caster that has no
 * `customDepthMaterial` through one shared MeshDepthMaterial, and each time consecutive casters
 * differ in skinning or instance colour, three rebuilds that material's program parameters and
 * cache key (~50 µs apiece, several times per frame). Casters of one kind point at their own
 * material, so none of them ever flips program.
 *
 * Opaque casters only: three still copies `map` / `alphaTest` from each caster's material onto a
 * custom depth material, so alpha-tested casters must keep three's per-material clones.
 */
import { MeshDepthMaterial, type Material } from "three";

export const skinnedCasterDepth = new MeshDepthMaterial();
skinnedCasterDepth.name = "Skinned caster depth";

export const colouredInstanceCasterDepth = new MeshDepthMaterial();
colouredInstanceCasterDepth.name = "Coloured instance caster depth";

/** True when the shadow pass would draw `material` with the shared, untextured depth material. */
export function opaqueCaster(material: Material | Material[]): boolean {
  return !Array.isArray(material) && !(material.alphaTest > 0) && !material.alphaToCoverage && !(material as { alphaMap?: unknown }).alphaMap;
}
