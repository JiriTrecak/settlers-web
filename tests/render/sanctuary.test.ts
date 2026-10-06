import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Mesh,MeshStandardMaterial,Texture} from 'three';
import {content} from '../../src/content/builtin';
const d=content.get('building.ants.sanctuary'),asset=content.asset(d.asset);
it('declares sanctuary revival behavior',()=>{expect(d.behaviors.revival?.workTicks).toBe(1200);});
// The sanctuary still ships the missing-model placeholder; model checks resume once a real GLB is published.
it.skipIf(asset.file!.includes('placeholder'))('loads the sanctuary model with a separately recolorable leaf canopy',async()=>{
 const bytes=readFileSync(asset.file!);const gltf=await new GLTFLoader().register(()=>({name:'geometry-test-textures',loadTexture:()=>Promise.resolve(new Texture())})).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');let triangles=0,team=0;
 gltf.scene.traverse(o=>{if(o instanceof Mesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;const m=o.material as MeshStandardMaterial;if(m.name==='TC_TeamColor'){team++;const c=o.geometry.attributes.color;if(c)for(let i=0;i<c.count;i++){expect(c.getX(i)).toBeGreaterThanOrEqual(.5);expect(c.getY(i)).toBe(c.getX(i));expect(c.getZ(i)).toBe(c.getX(i));}}}});
 expect(triangles).toBeGreaterThan(1000);expect(triangles).toBeLessThan(20000);expect(team).toBeGreaterThan(0);
});
