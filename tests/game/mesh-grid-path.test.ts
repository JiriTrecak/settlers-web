import {expect,it} from 'vitest';
import {snappedMeshGridPath} from '../../src/sim/game/meshGridPath';
import {appendRayCells,clearSweep,fixed} from '../../src/sim/game/motion';
import {adjacentSweep} from '../../src/sim/game/adjacentSweep';
import {canTraverse} from '../../src/sim/game/navigation';

it('keeps a boundary-skimming mesh corridor on collision-safe grid centers',()=>{
 const size=32,blocked=new Set([18*size+16]);
 const terrain=(_a:number,b:number)=>!blocked.has(b);
 const step=adjacentSweep(size,1500,terrain);
 const points=[{x:5,y:16},{x:13.998,y:15.998},{x:18.002,y:15.998},{x:24,y:16}].map(fixed);
 expect(appendRayCells(points[0]!,points[1]!,step,size,[])).toBe(false);
 const path=snappedMeshGridPath(points,step,size)!;
 expect(path).not.toBeNull();expect(path.at(-1)).toBe(16*size+24);
 let prior=16*size+5;
 for(const cell of path){
  expect(canTraverse(size,prior,cell,step)).toBe(true);
  const point=(id:number)=>fixed({x:id%size,y:Math.floor(id/size)});
  expect(clearSweep(point(prior),point(cell),terrain,size,1500)).toBe(true);
  prior=cell;
 }
});

it('rejects disconnected or obstructed corridors and never relocates the destination',()=>{
 const size=32,wall=(_a:number,b:number)=>b%size!==16;
 const points=[{x:5,y:16},{x:14,y:16},{x:18,y:16},{x:24,y:16}].map(fixed);
 expect(snappedMeshGridPath(points,wall,size)).toBeNull();
 const blockedGoal=(_a:number,b:number)=>b!==16*size+24;
 expect(snappedMeshGridPath(points,blockedGoal,size)).toBeNull();
});

it('joins a legal shoreline endpoint without cutting the corner or moving the target',()=>{
 const size=32,blocked=new Set([22*size+18]);
 const terrain=(_a:number,b:number)=>!blocked.has(b),step=adjacentSweep(size,1500,terrain);
 const a=fixed({x:5,y:5}),b=fixed({x:20,y:20});
 expect(step(20*size+20,20*size+20)).toBe(true);
 expect(appendRayCells(a,b,step,size,[])).toBe(false);
 for(const points of [[a,b],[b,a]]){
  const path=snappedMeshGridPath(points,step,size)!;
  expect(path).not.toBeNull();expect(path.at(-1)).toBe(points[1]!.y/1000*size+points[1]!.x/1000);
  let prior=points[0]!.y/1000*size+points[0]!.x/1000;
  for(const cell of path){expect(canTraverse(size,prior,cell,step)).toBe(true);prior=cell;}
 }
 // A blocked destination must still fail, even if neighboring joins are legal.
 blocked.add(20*size+20);expect(snappedMeshGridPath([a,b],step,size)).toBeNull();
});

it('repairs a clear corridor whose rasterized middle step clips an obstacle',()=>{
 // Reduced from Echo Isles tick 2571. All continuous mesh legs are clear;
 // three cells prevent corner-only snapping from repairing the first leg.
 const size=400,blocked=new Set([[386,25],[215,29],[320,31]].map(([x,y])=>y*size+x));
 const terrain=(_a:number,b:number)=>!blocked.has(b),step=adjacentSweep(size,1500,terrain);
 const points=[{x:384,y:27},{x:217.002,y:31.002},{x:152.998,y:31.002},{x:9,y:16}].map(fixed);
 for(let i=1;i<points.length;i++)expect(clearSweep(points[i-1]!,points[i]!,terrain,size,1500)).toBe(true);
 expect(appendRayCells(points[0]!,points[1]!,step,size,[])).toBe(false);
 const path=snappedMeshGridPath(points,step,size);
 expect(path).not.toBeNull();expect(path!.at(-1)).toBe(16*size+9);
 let prior=27*size+384,cost=0;
 for(const cell of path!){
  expect(canTraverse(size,prior,cell,step)).toBe(true);
  expect(clearSweep(fixed({x:prior%size,y:Math.floor(prior/size)}),fixed({x:cell%size,y:Math.floor(cell/size)}),terrain,size,1500)).toBe(true);
  cost+=cell%size!==prior%size&&Math.floor(cell/size)!==Math.floor(prior/size)?Math.SQRT2:1;prior=cell;
 }
 expect(cost).toBeLessThan(410); // No distant detour around the small obstruction.
 blocked.add(16*size+9);expect(snappedMeshGridPath(points,step,size)).toBeNull();
});
