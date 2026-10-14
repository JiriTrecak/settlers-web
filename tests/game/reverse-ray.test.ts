import {expect,it} from 'vitest';
import {appendRayCells,appendRayCellsFromEnd,fixed,type FixedPoint} from '../../src/sim/game/motion';

it('preserves every directed edge and successful cell order in every lattice direction',()=>{
 const size=17,origin=fixed({x:8,y:8});
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(const [from,to] of [[origin,fixed({x,y})],[fixed({x,y}),origin]]){
  const edges:string[]=[],reverseEdges:string[]=[],path=[-7,-8],reversePath=[-7,-8];
  expect(appendRayCells(from!,to!,(a,b)=>{edges.push(`${a}/${b}`);return true;},size,path)).toBe(true);
  expect(appendRayCellsFromEnd(from!,to!,(a,b)=>{reverseEdges.push(`${a}/${b}`);return true;},size,reversePath)).toBe(true);
  expect(reversePath).toEqual(path);
  expect(reverseEdges.sort()).toEqual(edges.sort());
  // Reject each edge independently, including diagonal side edges and the
  // stationary origin. Reversing the direction of an edge would miss failures.
  for(const blocked of new Set(edges)){
   const step=(a:number,b:number)=>`${a}/${b}`!==blocked;
   expect(appendRayCellsFromEnd(from!,to!,step,size,[])).toBe(appendRayCells(from!,to!,step,size,[]));
  }
 }
});

it('retains fractional boundary behavior and rejects out-of-bounds coordinates',()=>{
 let seed=8531;const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 const size=32;
 for(let i=0;i<4000;i++){
  const point=():FixedPoint=>({x:random(35001)-1500,y:random(35001)-1500});
  const from=point(),to=point(),path=[-1],other=[-1],salt=random(53);
  const step=(a:number,b:number)=>((Math.imul(a+salt,31)^b)>>>0)%53!==0;
  const expected=appendRayCells(from,to,step,size,path);
  expect(appendRayCellsFromEnd(from,to,step,size,other)).toBe(expected);
  if(expected)expect(other).toEqual(path);
 }
 for(const from of [fixed({x:-1,y:3}),fixed({x:32,y:3}),fixed({x:3,y:-1}),fixed({x:3,y:32})])
  expect(appendRayCellsFromEnd(from,fixed({x:3,y:3}),()=>true,size,[])).toBe(false);
});

it('rejects a blocked destination edge without scanning a long clear prefix',()=>{
 const size=512,from=fixed({x:5,y:100}),to=fixed({x:500,y:100}),blocked=100*size+500;
 let forward=0,backward=0;
 expect(appendRayCells(from,to,(_a,b)=>{forward++;return b!==blocked;},size,[])).toBe(false);
 expect(appendRayCellsFromEnd(from,to,(_a,b)=>{backward++;return b!==blocked;},size,[])).toBe(false);
 expect(forward).toBeGreaterThan(490);expect(backward).toBe(2);
});
