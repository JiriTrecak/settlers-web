import {expect,it} from 'vitest';
import {fixed} from '../../src/sim/game/motion';
import {game,placed} from './helpers';

it('matches uncached footprint sweeps at boundaries, obstacles and sub-cell positions',()=>{
 const g=game(),s=g.spatial;
 for(let y=10;y<25;y++)for(let x=10;x<25;x++){
  if((x*31+y*17)%13===0)s.terrain[y*s.size+x]=0;
  s.heights[y*s.size+x]=(x+y)%3*180;
 }
 s.rebuild();
 for(const radius of [.2,.4999,.5,.85,1.5,3.1])for(const locomotion of ['ground','air'] as const){
  const body={radius,height:5,formationSpacing:4,locomotion};
  for(let pass=0;pass<2;pass++)for(const y of [-1,0,1,10,15,16,17,24,s.size-1,s.size])
   for(const x of [-1,0,1,10,15,16,17,24,s.size-1,s.size])for(const offset of [0,.23]){
    const p={x:x+offset,y:y+offset},f=fixed(p);
    expect(s.unitWalkable(p,body)).toBe(s.clearSegment(f,f,undefined,body));
   }
 }
});

it('updates cached standing clearance after local placement, removal and terrain rebuild',()=>{
 const g=game(),s=g.spatial,body={radius:1.5,height:5,formationSpacing:4};
 const positions=Array.from({length:25},(_,i)=>({x:108+i%5,y:108+Math.floor(i/5)}));
 const check=()=>positions.map(p=>{
  const f=fixed(p),expected=s.clearSegment(f,f,undefined,body);
  expect(s.unitWalkable(p,body)).toBe(expected);return expected;
 });
 expect(check().every(Boolean)).toBe(true);
 const obstacle=g.context.create(placed('obstacle','building.test.house',110,110));
 s.appendOccupancy(obstacle);expect(check().some(v=>!v)).toBe(true);
 g.context.remove(obstacle);s.refreshAfterRemoval(obstacle.id);
 expect(check().every(Boolean)).toBe(true);
 s.terrain[s.cell({x:110,y:110})]=0;s.rebuild();
 expect(check().some(v=>!v)).toBe(true);
});
