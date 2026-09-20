import {expect,it} from 'vitest';
import {rasterUnderlays} from '../../scripts/maps/scouring/underlays';
import type {MapStamp} from '../../src/shared/map/utcmap';

it('projects original underlay alpha independently of map translation and composes overlapping instances deterministically',async()=>{
 const paths=new Map([['reference-fir-a','assets/library/asset.models.environment.trees.reference-fir-a/geometry.glb']]);
 const stamp:MapStamp={id:'fir',asset:'reference-fir-a',x:7.5,y:7.5,scale:1,sourceTransform:{height:10,quaternion:[0,0,0,1]}};
 const a=await rasterUnderlays([stamp],paths,[0,0],[1,1]);
 const b=await rasterUnderlays([{...stamp,x:stamp.x+20,y:stamp.y-4}],paths,[20,-4],[1,1]);
 expect(a.mask).toEqual(b.mask);expect(a.size).toEqual([49,49]);expect(a.instances).toBe(1);
 expect(Math.max(...a.mask)).toBeGreaterThan(200);expect(a.mask[0]).toBe(0);
 const overlapping=await rasterUnderlays([stamp,{...stamp,id:'duplicate'}],paths,[0,0],[1,1]);
 expect(overlapping.mask).toEqual(a.mask);
});
