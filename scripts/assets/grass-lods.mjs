/** Derived render-only grass LODs. Preserve purchased source meshes and palette. */
import {readFileSync,writeFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {SimplifyModifier} from 'three/addons/modifiers/SimplifyModifier.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
for(const name of ['grass_v5_03','grass_v5_06']){
 const bytes=readFileSync(`assets/environment/coniferous-pack/${name}.glb`);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 gltf.scene.updateMatrixWorld(true);
 let source;gltf.scene.traverse(o=>{if(o.isMesh)source=o.geometry.clone().applyMatrix4(o.matrixWorld);});
 if(!source)throw Error(`Missing grass mesh: ${name}`);
 // UVs are unnecessary after palette baking and would prevent seam welding.
 source.deleteAttribute('uv');source=mergeVertices(source);
 for(const [level,retained] of [['medium',.38],['far',.14]]){
  const mesh=new SimplifyModifier().modify(source,Math.floor(source.attributes.position.count*(1-retained)));
  const triangles=(mesh.index?.count??mesh.attributes.position.count)/3;
  if(!triangles||!mesh.attributes.color)throw Error('LOD lost geometry or palette');
  writeFileSync(`assets/environment/coniferous-pack/${name}-${level}.json`,JSON.stringify(mesh.toJSON()));
  console.log(name,level,triangles,'triangles');
 }
}
