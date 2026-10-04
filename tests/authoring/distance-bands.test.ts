import {expect,it} from 'vitest';
import {distanceBands} from '../../src/shared/authoring/distanceBands';
import {compileMaskDistance} from '../../src/shared/authoring/maskDistance';
import type {LayerShape} from '../../src/shared/authoring/layers';

it('conservative tiles preserve exact accepted samples across CSG holes and repainting',()=>{
 const shape:Extract<LayerShape,{type:'mask'}>={type:'mask',elevation:0,strokes:Array.from({length:100},(_,i)=>({operation:i%3?'subtract':'add',radius:.25+i%33,points:[{x:Math.sin(i*71)*100,z:Math.cos(i*33)*100},{x:Math.sin(i*8)*100,z:Math.cos(i*97)*100}]}))};
 const distance=compileMaskDistance(shape),query=distanceBands(distance);
 for(const [min,max] of [[0,Infinity],[.25,3],[-6,0],[5,8]])for(let i=0;i<2000;i++){
  const x=Math.sin(i*173)*140,z=Math.cos(i*79)*140,expected=distance(x,z);
  expect(query.within(x,z,min,max)).toBe(expected>=min&&expected<=max?expected:undefined);
  expect(query.contains(x,z,min,max)).toBe(expected>=min&&expected<=max);
  if(expected>=min&&expected<=max)expect(query.intersects(x,z,min,max)).toBe(true);
 }
});

it('accepts wholly contained tiles without extra exact queries and checks uncertain edges exactly',()=>{
 let calls=0;const query=distanceBands((x,z)=>{calls++;return 40-Math.hypot(x,z);});
 for(let i=0;i<100;i++)expect(query.contains(i/100,1,0)).toBe(true);
 expect(calls).toBe(1);
 for(const x of [40-1e-10,40,40+1e-10,-40])expect(query.contains(x,0,0)).toBe(40-Math.abs(x)>=0);
 expect(calls).toBeGreaterThan(1);
 expect(distanceBands(()=>-Infinity).contains(0,0,0)).toBe(false);
});

it('avoids per-candidate exact queries in empty tiles and keeps inclusive boundaries',()=>{
 let calls=0;const query=distanceBands((x,z)=>{calls++;return 10-Math.hypot(x,z);});
 for(let i=0;i<100;i++)expect(query.within(80+i/100,80,0)).toBeUndefined();
 expect(calls).toBe(1);
 expect(query.within(10,0,0)).toBe(0);expect(query.within(-10,0,0)).toBe(0);
 expect(distanceBands(()=>-Infinity).within(0,0,0)).toBeUndefined();
});

it('conservatively rejects jitter cells before sampling their random positions',()=>{
 const shape:Extract<LayerShape,{type:'mask'}>={type:'mask',elevation:0,strokes:[
  {operation:'add',radius:19,points:[{x:-12,z:5},{x:20,z:25}]},
  {operation:'subtract',radius:6,points:[{x:0,z:8},{x:8,z:14}]},
  {operation:'add',radius:2,points:[{x:1,z:10}]},
 ]};
 const distance=compileMaskDistance(shape),query=distanceBands(distance);
 let accepted=0,rejected=0;
 for(const spacing of [.35,2,9])for(const jitter of [0,.5,1])for(const [min,max] of [[-3,-.5],[0,1],[2,5]]){
  const reach=Math.abs(jitter*spacing)*Math.SQRT1_2+1e-7;
  for(let iz=-12;iz<=12;iz++)for(let ix=-12;ix<=12;ix++){
   const x=(ix+.5)*spacing,z=(iz+.5)*spacing,mayHit=query.intersects(x,z,min-reach,max+reach);
   if(!mayHit)rejected++;
   // Corners exercise the maximum displacement, including negative cells.
   for(const dx of [-.5,0,.5])for(const dz of [-.5,0,.5]){
    const d=distance(x+dx*jitter*spacing,z+dz*jitter*spacing);
    if(d>=min&&d<=max){accepted++;expect(mayHit).toBe(true);}
   }
  }
 }
 expect(accepted).toBeGreaterThan(100);expect(rejected).toBeGreaterThan(100);
});
