import {DoubleSide,FrontSide,InstancedBufferAttribute,InstancedMesh,Mesh,MeshBasicMaterial,PlaneGeometry,Sprite,type Material,type Object3D,type SpriteMaterial} from 'three';
import {effectTexture} from './effectTextures';

/**
 * Warm-up stand-ins for effects that create materials per cue (spell layers, command rings,
 * mine labels). three keys programs on map / side / instancing / instance colour, not on
 * colour or blending, so one mesh per combination links every variant before the match
 * starts. Without it, the first spell or mine sighting stalls the frame for 20–100 ms.
 */
export function effectWarmModels(sprite: SpriteMaterial): {models: Object3D[]; dispose: () => void} {
  const geometry = new PlaneGeometry(1, 1), texture = effectTexture('soft'), materials: Material[] = [], models: Object3D[] = [];
  for (const map of [null, texture]) for (const side of [FrontSide, DoubleSide]) for (const kind of ['mesh', 'instanced', 'coloured'] as const) {
    const material = new MeshBasicMaterial({map, side, forceSinglePass: true, transparent: true, depthWrite: false});
    materials.push(material);
    const mesh = kind === 'mesh' ? new Mesh(geometry, material) : new InstancedMesh(geometry, material, 1);
    if (kind === 'coloured') (mesh as InstancedMesh).instanceColor = new InstancedBufferAttribute(new Float32Array(3), 3);
    models.push(mesh);
  }
  // The label material is owned by its cache; only the sprite wrapper is temporary.
  models.push(new Sprite(sprite));
  return {models, dispose: () => { geometry.dispose(); texture.dispose(); for (const m of materials) m.dispose(); }};
}
