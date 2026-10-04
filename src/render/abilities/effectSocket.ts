import {Object3D,Quaternion,Vector3} from 'three';
import type {Asset} from '../../content/schema';
export type EffectSocketPose={position:Vector3;rotation:Quaternion};
export type EffectSocket=(entity:number,name:string)=>EffectSocketPose|undefined;
/** Socket names are semantic asset declarations, never spell-specific bone names. */
export function resolveEffectSocket(root:Object3D,sockets:Asset['sockets'],name:string):EffectSocketPose|undefined{
 const declaration=sockets?.find(s=>s.name===name);if(!declaration)return;
 const node=root.getObjectByName(declaration.node);if(!node)return;
 // Both live rigs and baked crowd socket proxies expose ordinary scene transforms.
 node.updateWorldMatrix(true,false);
 return {position:node.localToWorld(new Vector3(...declaration.offset)),rotation:node.getWorldQuaternion(new Quaternion())};
}
