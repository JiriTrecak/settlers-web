import {expect,it} from 'vitest';
import {nearestTrees} from '../../src/shared/authoring/nearestTrees';
import type {TerrainGrid} from '../../src/shared/authoring/generate';

it('matches brute-force stamping exactly across overlaps, fractional positions and clipped edges',()=>{
 const grid:TerrainGrid={originX:-16,originZ:-11,step:.75,width:65,height:49,samples:new Float32Array(65*49)};
 const trees=Array.from({length:260},(_,i)=>({x:Math.sin(i*13.71)*35+7,z:Math.cos(i*17.93)*27+5}));
 trees.push({x:.5,z:.5},{x:.5+1e-9,z:.5},{x:.5-1e-9,z:.5});
 for(const range of [0,.01,3.75,13]){
  const reference=new Float32Array(grid.width*grid.height).fill(Infinity);
  for(const t of trees){
   const x0=Math.max(0,Math.floor((t.x-range-grid.originX)/grid.step)),x1=Math.min(grid.width-1,Math.ceil((t.x+range-grid.originX)/grid.step));
   const z0=Math.max(0,Math.floor((t.z-range-grid.originZ)/grid.step)),z1=Math.min(grid.height-1,Math.ceil((t.z+range-grid.originZ)/grid.step));
   for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
    const i=z*grid.width+x,d=Math.hypot(grid.originX+x*grid.step-t.x,grid.originZ+z*grid.step-t.z);
    if(d<reference[i])reference[i]=d;
   }
  }
  expect(nearestTrees(grid,trees,range)).toEqual(reference);
 }
 expect(nearestTrees(grid,[],13).every(v=>v===Infinity)).toBe(true);
});

import {updateNearestTrees} from '../../src/shared/authoring/nearestTrees';
it('incremental moves, removals, duplicates and undo preserve exact full-raster bytes and old snapshots',()=>{
 const grid:TerrainGrid={originX:-16,originZ:-11,step:.75,width:257,height:193,samples:new Float32Array(257*193)};
 let trees=Array.from({length:640},(_,i)=>({x:Math.sin(i*13.71)*110+60,z:Math.cos(i*17.93)*80+45}));
 trees.push({...trees[0]},{x:.5+1e-9,z:.5},{x:.5-1e-9,z:.5});
 const original=trees.slice();let snapshot=updateNearestTrees(grid,trees,7.5);
 for(let round=0;round<22;round++){
  const oldBytes=snapshot.values.slice();
  if(round===20)trees=original;
  else if(round===21)trees=original.slice().reverse();
  else if(round%3===0)trees=trees.filter((_,i)=>i!==round);
  else if(round%3===1)trees=[...trees,{x:round*.013,z:round*.071}];
  else trees=trees.map((p,i)=>i===round?{x:p.x+2,z:p.z-3}:p);
  const next=updateNearestTrees(grid,trees,7.5,snapshot);
  expect(next.values).toEqual(nearestTrees(grid,trees,7.5));expect(snapshot.values).toEqual(oldBytes);
  snapshot=next;
 }
});

it('invalidates layouts/range, handles empty and off-grid influences, and can reuse unchanged positions',()=>{
 const grid:TerrainGrid={originX:-16,originZ:-16,step:1,width:33,height:49,samples:new Float32Array(33*49)},trees=[{x:-16.2,z:-16.1},{x:16,z:32}];
 const first=updateNearestTrees(grid,trees,3);
 expect(updateNearestTrees(grid,trees.slice().reverse(),3,first).values).toBe(first.values);
 for(const nextGrid of [grid,{...grid,originX:-15.5},{...grid,step:.75},{...grid,width:34}])for(const range of [0,.01,3,7]){
  const nextTrees=[...trees,{x:10000,z:-10000}];
  expect(updateNearestTrees(nextGrid,nextTrees,range,first).values).toEqual(nearestTrees(nextGrid,nextTrees,range));
 }
 expect(updateNearestTrees(grid,[],3,first).values).toEqual(nearestTrees(grid,[],3));
 const many=Array.from({length:500},(_,i)=>({x:i%30-15,z:Math.floor(i/30)-15}));
 expect(updateNearestTrees(grid,many,10,first).values).toEqual(nearestTrees(grid,many,10));
});
