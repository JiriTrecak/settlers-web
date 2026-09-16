import {it,expect} from 'vitest';
import {Raycaster,Vector3} from 'three';
import {WalkSurfacePicker} from '../../src/render/terrain/walkSurfacePicker';
import type {BridgeSurface} from '../../src/shared/map/bridgeSurface';
const arch:BridgeSurface={id:'arch',level:2,x:10,z:10,c:1,s:0,base:0,width:4,depth:20,height:2,arch:4,rise:2,thickness:.6};
const ray=(x:number,z:number)=>new Raycaster(new Vector3(x,20,z),new Vector3(0,-1,0));
it('picks the elevated floor using its arch, rise, level and stable stamp identity',()=>{
 const p=new WalkSurfacePicker();p.set([arch]);
 expect(p.pick(ray(10,10))).toMatchObject({surface:'arch',level:2,x:10,z:10,y:7});
 expect(p.pick(ray(10,0))?.y).toBeCloseTo(2);
 expect(p.pick(ray(10,20))?.y).toBeCloseTo(4);
 expect(p.pick(ray(13,10))).toBeNull();p.dispose();
});
it('respects nearer terrain and resolves the closest of overlapping decks',()=>{
 const p=new WalkSurfacePicker();p.set([arch,{...arch,id:'upper',level:3,base:3}]);
 expect(p.pick(ray(10,10))?.surface).toBe('upper');
 expect(p.pick(ray(10,10),9)).toBeNull();
 p.set([arch]);expect(p.pick(ray(10,10))?.surface).toBe('arch');
 p.dispose();expect(p.pick(ray(10,10))).toBeNull();
});
