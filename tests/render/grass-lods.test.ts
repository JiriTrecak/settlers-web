import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {BufferGeometryLoader} from 'three';
describe('purchased grass render LODs',()=>{
 for(const [name,sourceTriangles] of [['grass_v5_03',504],['grass_v5_06',734]] as const){
  it(`${name} retains a grounded colored silhouette at lower cost`,()=>{
   let previous:number=sourceTriangles;
   for(const level of ['medium','far']){
    const geometry=new BufferGeometryLoader().parse(JSON.parse(readFileSync(`assets/environment/coniferous-pack/${name}-${level}.json`,'utf8')));
    const count=(geometry.index?.count??geometry.attributes.position!.count)/3;
    expect(count).toBeGreaterThan(10);expect(count).toBeLessThan(previous*.6);previous=count;
    expect(geometry.attributes.color!.count).toBe(geometry.attributes.position!.count);
    geometry.computeBoundingBox();const box=geometry.boundingBox!;
    expect(box.min.y).toBeGreaterThan(-.02);expect(box.min.y).toBeLessThan(.12);
    expect(box.max.y).toBeGreaterThan(.1);expect(box.max.x-box.min.x).toBeGreaterThan(.2);
    expect(Array.from(geometry.attributes.position!.array).every(Number.isFinite)).toBe(true);
   }
  });
 }
});
