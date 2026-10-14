import {expect,it} from 'vitest';
import {TerrainClearance} from '../../src/sim/game/terrainClearance';
import {clearSweep,fixed} from '../../src/sim/game/motion';
import {MAX_GROUND_STEP_CM} from '../../src/shared/map/tacticalTerrain';
import {game,placed} from './helpers';

it('only certifies sweeps accepted by the original rays across varied terrain and body sizes',()=>{
 const size=67,heights=new Int16Array(size*size),blocked=new Uint8Array(size*size);
 let seed=73;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 const walkable=(i:number)=>!blocked[i];
 const proof=new TerrainClearance(size,heights,walkable);
 const step=(a:number,b:number)=>walkable(b)&&Math.abs(heights[a]-heights[b])<=MAX_GROUND_STEP_CM;
 let proved=0,rejected=0;
 for(let scene=0;scene<3;scene++){
  if(scene===1)for(let i=0;i<heights.length;i++)heights[i]=Math.floor(i/size)*2;
  if(scene===2)for(let i=0;i<heights.length;i++){
   if(random()<.01)blocked[i]=1;
   if(i%size>35&&i%size<38)heights[i]+=200;
  }
  proof.invalidate();
  for(let n=0;n<6000;n++){
   const from={x:Math.round((random()*size-1)*1000),y:Math.round((random()*size-1)*1000)};
   const to={x:Math.round((random()*size-1)*1000),y:Math.round((random()*size-1)*1000)};
   const radius=[0,200,499,500,850,1500,3000][n%7];
   const accepted=proof.provesClear(from,to,radius),exact=clearSweep(from,to,step,size,radius);
   if(accepted){proved++;expect(exact).toBe(true);}else rejected++;
  }
 }
 expect(proved).toBeGreaterThan(3000);expect(rejected).toBeGreaterThan(3000);
});

it('retains exact live clearance after placement, removal, reservations and terrain rebuild',()=>{
 const g=game(),s=g.spatial,body={radius:1.5,height:5,formationSpacing:4};
 const from=fixed({x:70,y:110}),to=fixed({x:150,y:110});
 const exact=()=>clearSweep(from,to,(a,b)=>s.walkable(b)&&Math.abs(s.heights[a]-s.heights[b])<=MAX_GROUND_STEP_CM,s.size,1500);
 const check=()=>expect(s.clearSegment(from,to,undefined,body)).toBe(exact());
 expect(s.clearSegment(from,to,undefined,body)).toBe(true);check();
 expect(s.clearSegment(from,to,new Set([s.cell({x:100,y:110})]),body)).toBe(false);
 const obstacle=g.context.create(placed('obstacle','building.test.house',110,110));
 s.appendOccupancy(obstacle);check();expect(exact()).toBe(false);
 g.context.remove(obstacle);s.refreshAfterRemoval(obstacle.id);check();expect(exact()).toBe(true);
 s.heights[s.cell({x:100,y:110})]=200;s.rebuild();check();expect(exact()).toBe(false);
});

it('answers long sweeps per body width and direction, and always honours live reservations',()=>{
 const g=game(),s=g.spatial;
 for(let y=0;y<s.size;y++)if(y<109||y>111)s.terrain[y*s.size+110]=0;
 s.rebuild();
 const a=fixed({x:70,y:110}),b=fixed({x:150,y:110});
 const check=()=>{
  const results:boolean[]=[];
  for(const radius of [.2,.5,1.5,3])for(const [from,to] of [[a,b],[b,a]]){
   const body={radius,height:5,formationSpacing:4};
   const expected=clearSweep(from,to,(x,y)=>s.walkable(y)&&Math.abs(s.heights[x]-s.heights[y])<=MAX_GROUND_STEP_CM,s.size,Math.round(radius*1000));
   results.push(s.clearSegment(from,to,undefined,body));expect(results.at(-1)).toBe(expected);
   expect(s.clearSegment(from,to,new Set([s.cell({x:90,y:110})]),body)).toBe(false);
   expect(s.clearSegment(from,to,undefined,body)).toBe(expected);
  }
  expect(results).toContain(true);expect(results).toContain(false);
 };
 check();check();
});

it('rejects a long segment for a nearby reservation, a wall touching the body side, or a height step',()=>{
 const g=game(),s=g.spatial;
 s.terrain.fill(1);s.heights.fill(0);s.occupied.fill(0);s.resources.fill(0);
 s.rebuild();
 const from={x:40000,y:100000},to={x:220000,y:100000},body={radius:.75,height:2,formationSpacing:2};
 const blocked=new Set([s.cell({x:41,y:100})]);
 expect(s.clearSegment(from,to,blocked,body)).toBe(false);
 blocked.clear();expect(s.clearSegment(from,to,blocked,body)).toBe(true);
 // The center is clear, but a wide body's side overlaps a wall.
 s.terrain[s.cell({x:120,y:101})]=0;s.rebuild();
 expect(s.clearSegment(from,to,blocked,body)).toBe(false);
 s.terrain[s.cell({x:120,y:101})]=1;s.heights[s.cell({x:120,y:100})]=500;s.rebuild();
 expect(s.clearSegment(from,to,blocked,body)).toBe(false);
});
