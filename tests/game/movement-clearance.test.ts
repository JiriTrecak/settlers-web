import {expect,it} from 'vitest';
import {game} from './helpers';

it('classifies terrain and reservation blockage exactly like the separate movement checks',()=>{
 const s=game().spatial;let seed=811;
 const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let i=0;i<500;i++){
  const x=80+random(24),y=80+random(24),cell=y*s.size+x;
  s.terrain[cell]=random(5)?1:0;s.heights[cell]=random(200);
 }
 s.rebuild();
 for(const locomotion of ['ground','air'] as const)for(const radius of [.34,.595,1.7])for(let i=0;i<500;i++){
  const actor={radius,height:2,formationSpacing:2,locomotion};
  const from={x:(78+random(28))*1000+random(1000)-500,y:(78+random(28))*1000+random(1000)-500};
  const to={x:from.x+random(6001)-3000,y:from.y+random(6001)-3000};
  if(i%20===0)to.x=-2000;
  const blocked=i%3?new Set(Array.from({length:30},()=>s.size*(78+random(28))+78+random(28))):undefined;
  const expected=!s.clearSegment(from,to,undefined,actor)?'terrain':blocked&&!s.clearSegment(from,to,blocked,actor)?'reservation':null;
  expect(s.movementSegmentBlocker(from,to,blocked,actor)).toBe(expected);
 }
});

it('reports a corner reservation, then gives terrain blockage precedence over it',()=>{
 const s=game().spatial,actor={radius:.595,height:2,formationSpacing:2};
 const from={x:100000,y:100000},to={x:101000,y:101000},blocked=new Set([100*s.size+101]);
 expect(s.movementSegmentBlocker(from,to,blocked,actor)).toBe('reservation');
 s.terrain[101*s.size+101]=0;
 // Direct terrain edits use the same rebuild boundary as a loaded/editor map.
 // Occupancy changes have their own local invalidation path.
 s.rebuild();
 expect(s.movementSegmentBlocker(from,to,blocked,actor)).toBe('terrain');
});
