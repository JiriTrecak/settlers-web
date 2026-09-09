import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Mesh,MeshStandardMaterial} from 'three';
import {content} from '../../src/content/builtin';
it('loads the sanctuary model with a separately recolorable flag and declared revival behavior',async()=>{
 const d=content.get('building.ants.sanctuary'),asset=content.asset(d.asset);expect(d.behaviors.revival?.workTicks).toBe(400);
 const bytes=readFileSync(asset.file!);const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');let triangles=0,team=0;
 gltf.scene.traverse(o=>{if(o instanceof Mesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;const m=o.material as MeshStandardMaterial;if(m.name==='TC_TeamColor'){team++;const c=o.geometry.attributes.color;if(c)for(let i=0;i<c.count;i++){expect(c.getX(i)).toBe(1);expect(c.getY(i)).toBe(1);expect(c.getZ(i)).toBe(1);}}}});
 expect(triangles).toBeGreaterThan(1000);expect(triangles).toBeLessThan(20000);expect(team).toBeGreaterThan(0);
});
