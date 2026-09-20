import {Mesh,MeshStandardMaterial,NoColorSpace,type Texture} from 'three';
import type {GLTFLoaderPlugin,GLTFParser} from 'three/addons/loaders/GLTFLoader.js';

/** Additional source M/R/backlighting map retained in the GLB's material extras.
 * It is not glTF's ORM map: source red is metalness, green roughness, blue
 * reduces the directional falloff. Do not interpret blue as ambient occlusion. */
export function referenceMaterialPlugin(parser:GLTFParser):GLTFLoaderPlugin {
 return {name:'UTC_reference_material',async afterRoot(gltf){
  const pending=new Map<MeshStandardMaterial,Promise<void>>();
  gltf.scene.traverse(node=>{
   if(!(node instanceof Mesh))return;
   for(const material of Array.isArray(node.material)?node.material:[node.material]){
    const index=material.userData.shadingTexture;
    if(!(material instanceof MeshStandardMaterial)||!material.userData.referenceEnvironment||!Number.isInteger(index)||pending.has(material))continue;
    if(index<0||index>=parser.json.textures.length)throw Error('Invalid source shading texture index');
    pending.set(material,(async()=>{
     const texture=await parser.getDependency('texture',index) as Texture;
     texture.colorSpace=NoColorSpace;texture.anisotropy=8;
     material.roughnessMap=texture;material.metalnessMap=texture;material.metalness=1;
     material.userData.sourceShadingLoaded=true;material.needsUpdate=true;
    })());
   }
  });
  await Promise.all(pending.values());
 }};
}
