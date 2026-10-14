import {DoubleSide,FrontSide,InstancedBufferAttribute,InstancedMesh,Mesh,MeshBasicMaterial,PlaneGeometry,type Material,type Object3D} from 'three';
import {effectTexture} from './effectTextures';

/**
 * Stand-ins for simple command rings and settlement billboards. Spell recipes additionally
 * prepare their actual resources/custom materials in EffectPlayer.prepare; these generic
 * meshes cannot cover sprite, flipbook, trail, skinned-model or soft-shape variants.
 */
export function effectWarmModels(): {models: Object3D[]; dispose: () => void} {
  const geometry = new PlaneGeometry(1, 1), texture = effectTexture('soft'), materials: Material[] = [], models: Object3D[] = [];
  for (const map of [null, texture]) for (const side of [FrontSide, DoubleSide]) for (const kind of ['mesh', 'instanced', 'coloured'] as const) {
    const material = new MeshBasicMaterial({map, side, forceSinglePass: true, transparent: true, depthWrite: false});
    materials.push(material);
    const mesh = kind === 'mesh' ? new Mesh(geometry, material) : new InstancedMesh(geometry, material, 1);
    if (kind === 'coloured') (mesh as InstancedMesh).instanceColor = new InstancedBufferAttribute(new Float32Array(3), 3);
    models.push(mesh);
  }
  return {models, dispose: () => { geometry.dispose(); texture.dispose(); for (const m of materials) m.dispose(); }};
}
