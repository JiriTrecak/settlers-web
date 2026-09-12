import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {SkinnedMesh,Vector3,MeshStandardMaterial} from 'three';
import {batchCharacterMaterials} from '../../src/render/characters/materialBatch';
import {createCharacterInstance} from '../../src/render/characters/character-player.js';

for(const variant of ['base','warrior','archer','marshal'] as const) it(`batches ${variant} without changing skinned vertices, PBR factors or ownership`,async()=>{
 const bytes=readFileSync(`assets/models/units/ants/${variant==='base'?'worker':variant}/model.glb`);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const surfaces=(root:typeof gltf.scene)=>{const rows:string[]=[];root.traverse(o=>{if(o instanceof SkinnedMesh){const m=o.material as MeshStandardMaterial,g=o.geometry;for(let i=0;i<g.attributes.position.count;i++){let c=m.color.toArray(),r=m.roughness,t=m.metalness;if(m.vertexColors){c=[g.attributes.color.getX(i),g.attributes.color.getY(i),g.attributes.color.getZ(i)];const palette=m.roughnessMap!.image as {data:Float32Array;height:number};const index=Math.floor(g.attributes.uv.getY(i)*palette.height)*4;r=palette.data[index+1];t=palette.data[index+2];}rows.push([...new Vector3().fromBufferAttribute(g.attributes.position,i).toArray(),...c,r,t].map(n=>n.toFixed(5)).join(','));}}});return rows.sort();};
 const authored=surfaces(gltf.scene);
 const before=createCharacterInstance(gltf,variant);
 let originalDraws=0;gltf.scene.traverse(o=>{if(o instanceof SkinnedMesh)originalDraws++;});
 const dispose=batchCharacterMaterials(gltf.scene,gltf.animations);
 expect(surfaces(gltf.scene)).toEqual(authored);
 const after=createCharacterInstance(gltf,variant);
 let draws=0;after.root.traverse(o=>{if(o instanceof SkinnedMesh){draws++;const m=o.material as MeshStandardMaterial;if(m.vertexColors){expect(m.roughnessMap).toBe(m.metalnessMap);expect(m.roughness).toBe(1);expect(m.metalness).toBe(1);}}});
 expect(draws).toBeLessThanOrEqual(4);expect(draws).toBeLessThan(originalDraws);
 const vertices=(root:typeof before.root)=>{const result:string[]=[];root.updateMatrixWorld(true);root.traverse(o=>{if(o instanceof SkinnedMesh){o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i++){const v=o.getVertexPosition(i,new Vector3()).applyMatrix4(o.matrixWorld);result.push(v.toArray().map(n=>n.toFixed(5)).join(','));}}});return result.sort();};
 for(const state of ['idle','run','attack','death'] as const){before.player.setState(state,{restart:true});after.player.setState(state,{restart:true});before.player.seek(.3);after.player.seek(.3);expect(vertices(after.root)).toEqual(vertices(before.root));}
 after.player.setTeamColor('#2878df');let team=0;after.root.traverse(o=>{if(o instanceof SkinnedMesh){const m=o.material as MeshStandardMaterial;if(m.name==='TC_TeamColor'){team++;expect(m.color.getHexString()).toBe('2878df');}}});expect(team).toBeGreaterThan(0);
 before.dispose();after.dispose();dispose();
});
