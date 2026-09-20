import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {forestGrassGeometry} from '../../src/render/foliage/forestGrass';

it('uses entire grounded blades in each opaque forest LOD and preserves both authored colors',async()=>{
 const bytes=readFileSync('assets/library/asset.models.environment.grass.canopy-short-grass/geometry.glb');
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
 const counts:number[]=[];
 for(const stride of [1,2,4]){
  const g=forestGrassGeometry(scene,stride),p=g.getAttribute('position'),c=g.getAttribute('color');
  counts.push(p.count/3);expect(p.count%9).toBe(0);expect(c.count).toBe(p.count);
  expect(g.boundingBox!.min.y).toBeCloseTo(0);expect(g.boundingBox!.max.y).toBeGreaterThan(.25);
  expect(g.boundingBox!.max.y).toBeLessThan(.4);
  for(let start=0;start<p.count;start+=9){
   const heights=Array.from({length:9},(_,j)=>p.getY(start+j));
   expect(Math.min(...heights)).toBeCloseTo(0);expect(Math.max(...heights)).toBeGreaterThan(.1);
  }
  expect(Array.from(c.array).every(v=>v>=0&&v<=1)).toBe(true);g.dispose();
 }
 expect(counts).toEqual([102,51,27]);
});
