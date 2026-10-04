import {expect,it} from 'vitest';
import {compileMaskDistance} from '../../src/shared/authoring/maskDistance';
import {regionDistance} from '../../src/shared/authoring/shapes';
import type {LayerShape} from '../../src/shared/authoring/layers';

it('indexed brush CSG exactly matches exhaustive distances, including subtraction, repainting and variable radii',()=>{
 const masks:Extract<LayerShape,{type:'mask'}>[]=[
  {type:'mask',elevation:0,strokes:[]},
  ...[0,1,2,3].map(variant=>({type:'mask' as const,elevation:0,strokes:Array.from({length:180},(_,i)=>({
   operation:(Math.floor(i/(variant===0?1:37))%2?'subtract':'add') as 'add'|'subtract',
   radius:.25+(i*17%80),points:Array.from({length:i%7+1},(_,j)=>({x:Math.sin(i*71+j)*350,z:Math.cos(i*13+j)*350})),
  }))})),
 ];
 for(const mask of masks){
  const query=compileMaskDistance(mask);
  for(let i=0;i<500;i++){const x=Math.sin(i*177)*1100,z=Math.cos(i*97)*1100;expect(query(x,z)).toBe(regionDistance(x,z,mask));}
 }
});

it('compiled masks snapshot mutable editor strokes and preserve exact brush edges',()=>{
 const mask:Extract<LayerShape,{type:'mask'}>={type:'mask',elevation:0,strokes:[
  {operation:'add',radius:10,points:[{x:0,z:0},{x:20,z:0}]},
  {operation:'subtract',radius:5,points:[{x:10,z:0}]},
  {operation:'add',radius:2,points:[{x:10,z:0}]},
 ]};
 const query=compileMaskDistance(mask);
 for(const [x,z] of [[0,10],[10,0],[10,5],[20,-10],[-10,0]])expect(query(x!,z!)).toBe(regionDistance(x!,z!,mask));
 mask.strokes[2]!.points[0]!.x=100;
 expect(query(10,0)).toBe(2);expect(compileMaskDistance(mask)(10,0)).toBe(-5);
});
