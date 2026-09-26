// Shared by the game and the Blender studio. Alpha is an ownership mask, never
// transparency. RGB retains the authored image for ordinary glTF viewers.
const installed = new WeakSet();
export function prepareMaskedTeamColor(material) {
  if (material.userData.teamColorMask !== 'baseColorAlpha' || !material.map) return false;
  if (installed.has(material)) return true;
  installed.add(material);
  const prior = material.onBeforeCompile;
  const priorKey = material.customProgramCacheKey();
  const sourceMax = Math.max(.001, Number(material.userData.teamColorSourceMax) || 1);
  material.color.fromArray(material.userData.teamColorDefault ?? [1, 1, 1]);
  material.onBeforeCompile = (shader, renderer) => {
    prior.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 ownershipSample = texture2D(map, vMapUv);
        float ownershipShade = max(ownershipSample.r, max(ownershipSample.g, ownershipSample.b)) / ${sourceMax.toFixed(8)};
        diffuseColor.rgb = mix(ownershipSample.rgb, vec3(ownershipShade) * diffuseColor.rgb, ownershipSample.a);
      #endif
    `);
  };
  material.customProgramCacheKey = () => priorKey + '|ownership-alpha-v1|' + sourceMax;
  material.needsUpdate = true;
  return true;
}
