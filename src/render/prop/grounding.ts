import catalog from '../../../assets/catalog.json';
const structuralOrigins=new Set(catalog.assets.filter(e=>'deck' in e).map(e=>e.id));
import { Box3, type Object3D } from 'three';

/** Rotated glTF roots require vertex-accurate bounds for the soil line.
 * Rotating an existing axis-aligned box can invent corners below the mesh. */
export function prototypeBounds(root:Object3D):Box3 {
  root.updateMatrixWorld(true);
  return new Box3().setFromObject(root,true);
}

/** Preserve the soil line of trees with buried roots; repair positive import offsets. */
export function prototypeGroundOffset(asset:string,minY:number,floating:boolean):number {
  if(structuralOrigins.has(asset)||floating||!Number.isFinite(minY)||asset.includes('pillar-arch'))return 0;
  if(/tree-|pine|spruce/.test(asset)&&minY<0)return 0;
  return -minY;
}
