import {expect,it} from 'vitest';
import {PlacementSearch} from '../../src/sim/ai/placementSearch';
import {MAX_GROUND_STEP_CM} from '../../src/shared/map/tacticalTerrain';
import type {Point} from '../../src/sim/game/state';

/** Specification: 4-neighbour BFS from the rounded origin, bounded by radius and 4096 expansions, that may not enter
 * blocked, proposed-footprint, water or over-step cells, and succeeds when it reaches within one cell of the door. */
it('matches the bounded 4-neighbour door reachability specification on seeded random terrain',()=>{
 const size=96,map={size,land:Array(size*size).fill(1),heights:Array(size*size).fill(0)};
 const search=new PlacementSearch();
 const reference=(blocked:Set<number>,proposed:Set<number>,origin:Point,door:Point,radius:number)=>{
  const seen=new Set<number>(),queue=[{x:Math.round(origin.x),y:Math.round(origin.y)}];
  for(let i=0;i<queue.length&&i<4096;i++){
   const a=queue[i]!;
   if(Math.hypot(a.x-door.x,a.y-door.y)<1)return true;
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const q={x:a.x+dx!,y:a.y+dy!},id=q.y*size+q.x;
    if(q.x<0||q.y<0||q.x>=size||q.y>=size||Math.hypot(q.x-origin.x,q.y-origin.y)>radius||seen.has(id)||proposed.has(id)||blocked.has(id)||!map.land[id]||Math.abs(map.heights[id]-map.heights[a.y*size+a.x])>MAX_GROUND_STEP_CM)continue;
    seen.add(id);queue.push(q);
   }
  }return false;
 };
 let seed=57;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 const outcomes=new Set<boolean>();
 for(let run=0;run<60;run++){
  const blocked=new Set<number>(),proposed=new Set<number>();
  for(let i=0;i<size*size;i++){map.land[i]=+(random()>.05);map.heights[i]=random()>.95?MAX_GROUND_STEP_CM+1:0;if(random()<.1)blocked.add(i);}
  const origin={x:run%3===0?2:48.2,y:48},door={x:run%4===0?95:20+run%60,y:48},radius=run%2?24:44;
  for(let y=46;y<50;y++)for(let x=40;x<44;x++)proposed.add(y*size+x);
  if(run===59){map.land.fill(1);map.heights.fill(0);blocked.clear();proposed.clear();door.x=95;}
  const expected=reference(blocked,proposed,origin,door,radius);outcomes.add(expected);
  expect(search.reachable(map,blocked,proposed,origin,door,radius)).toBe(expected);
 }
 // The seeded cases exercise both answers.
 expect([...outcomes].sort()).toEqual([false,true]);
});
