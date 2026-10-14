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

it('includes exact diagonal corner cells and rejects height steps across word boundaries',()=>{
 const size=70,heights=new Int16Array(size*size),blocked=new Set<number>();
 const proof=new TerrainClearance(size,heights,i=>!blocked.has(i));
 for(const [x,y] of [[8,7],[7,8],[32,31],[31,32],[64,63],[63,64]]){
  const cell=y*size+x;blocked.add(cell);proof.invalidate([cell]);
  expect(proof.provesClear({x:1000,y:1000},{x:68000,y:68000},0)).toBe(false);
  blocked.delete(cell);proof.invalidate([cell]);
 }
 expect(proof.provesClear({x:1000,y:1000},{x:68000,y:68000},0)).toBe(true);
 for(let y=0;y<size;y++)for(let x=32;x<size;x++)heights[y*size+x]=91;
 proof.invalidate();
 expect(proof.provesClear({x:1000,y:10000},{x:68000,y:10000},0)).toBe(false);
});

it('certifies travel beside cliffs without certifying travel across their height edges',()=>{
 const size=70,heights=new Int16Array(size*size),blocked=new Set<number>();
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)heights[y*size+x]=y<20?200:0;
 const proof=new TerrainClearance(size,heights,i=>!blocked.has(i));
 const exact=(a:{x:number;y:number},b:{x:number;y:number},radius:number)=>clearSweep(a,b,
  (x,y)=>!blocked.has(y)&&Math.abs(heights[x]-heights[y])<=MAX_GROUND_STEP_CM,size,radius);
 for(const radius of [0,499,500,1500,3000]){
  const a=fixed({x:5,y:20}),b=fixed({x:65,y:20});
  for(const [from,to] of [[a,b],[b,a],[a,a]]){
   expect(exact(from,to,radius)).toBe(true);expect(proof.provesClear(from,to,radius)).toBe(true);
  }
  for(const [from,to] of [[fixed({x:5,y:15}),fixed({x:65,y:25})],[fixed({x:65,y:25}),fixed({x:5,y:15})]]){
   expect(exact(from,to,radius)).toBe(false);expect(proof.provesClear(from,to,radius)).toBe(false);
  }
 }
 // Occupancy is independent of movement direction, including stationary rays.
 const cell=20*size+32;blocked.add(cell);proof.invalidate([cell]);
 expect(proof.provesClear(fixed({x:5,y:20}),fixed({x:65,y:20}),1500)).toBe(false);
 blocked.delete(cell);proof.invalidate([cell]);
 expect(proof.provesClear(fixed({x:5,y:20}),fixed({x:65,y:20}),1500)).toBe(true);
});

it('preserves exact directed rays through terraced slopes, sub-cell endpoints and occupancy edits',()=>{
 const size=39,heights=new Int16Array(size*size),blocked=new Uint8Array(size*size);
 let seed=187;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 const proof=new TerrainClearance(size,heights,i=>!blocked[i]);
 let accepted=0,rejected=0;
 for(const axis of ['x','y','diagonal'] as const){
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)heights[y*size+x]=Math.floor((axis==='x'?x:axis==='y'?y:x+y)/8)*100;
  proof.invalidate();
  for(let n=0;n<4000;n++){
   const cell=Math.floor(random()*blocked.length);blocked[cell]^=1;proof.invalidate([cell]);
   const point=()=>({x:Math.round(random()*(size-1)*1000),y:Math.round(random()*(size-1)*1000)});
   const from=point(),to=n%3?point():from,radius=[0,200,499,500,850,1500,3000][n%7]!;
   const clear=proof.provesClear(from,to,radius);
   if(clear){
    accepted++;expect(clearSweep(from,to,(a,b)=>!blocked[b]&&Math.abs(heights[a]-heights[b])<=MAX_GROUND_STEP_CM,size,radius)).toBe(true);
   }else rejected++;
  }
 }
 expect(accepted).toBeGreaterThan(50);expect(rejected).toBeGreaterThan(5000);
});

it('retains exact live clearance after placement, removal, reservations and terrain rebuild',()=>{
 const g=game(),s=g.spatial,body={radius:1.5,height:5,formationSpacing:4};
 const from=fixed({x:70,y:110}),to=fixed({x:150,y:110});
 const exact=()=>clearSweep(from,to,(a,b)=>s.walkable(b)&&Math.abs(s.heights[a]-s.heights[b])<=MAX_GROUND_STEP_CM,s.size,1500);
 const check=()=>expect(s.clearSegment(from,to,undefined,body)).toBe(exact());
 expect(s.clearSegment(from,to,undefined,body)).toBe(true);check();
 expect(s.clearSegment(from,to,new Set([s.cell({x:100,y:110})]),body)).toBe(false);
 const obstacle=g.context.create(placed('obstacle','building.ants.house',110,110));
 s.appendOccupancy(obstacle);check();expect(exact()).toBe(false);
 g.context.remove(obstacle);s.refreshAfterRemoval(obstacle.id);check();expect(exact()).toBe(true);
 s.heights[s.cell({x:100,y:110})]=200;s.rebuild();check();expect(exact()).toBe(false);
});

it('shares long terrain answers without mixing body widths, directions or live reservations',()=>{
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
 // Exercise bounded eviction with distinct sub-cell endpoints, then recheck
 // the original narrow passage after its memoized results may be evicted.
 for(let i=0;i<1100;i++)s.clearSegment(fixed({x:20+i/1000,y:30}),fixed({x:70,y:30}),undefined,{radius:.5,height:5,formationSpacing:4});
 check();
});

it('keeps short-sweep reuse exact through nearby edits, eviction and profile changes',()=>{
 const g=game(),s=g.spatial;
 const a=fixed({x:105.25,y:110.5}),b=fixed({x:118.75,y:111});
 const check=()=>{
  for(const radius of [.2,.5,1.5,3])for(const [from,to] of [[a,b],[b,a],[a,a]]){
   const body={radius,height:5,formationSpacing:4};
   const exact=clearSweep(from,to,(x,y)=>s.walkable(y)&&Math.abs(s.heights[x]-s.heights[y])<=MAX_GROUND_STEP_CM,s.size,Math.round(radius*1000));
   expect(s.clearSegment(from,to,undefined,body)).toBe(exact);
   expect(s.clearSegment(from,to,undefined,body)).toBe(exact);
   // Dynamic reservations are never included in the terrain cache.
   expect(s.clearSegment(from,to,new Set([s.cell({x:from.x/1000,y:from.y/1000})]),body)).toBe(false);
   expect(s.clearSegment(from,to,undefined,body)).toBe(exact);
  }
 };
 check();
 const obstacle=g.context.create(placed('short-obstacle','building.ants.house',112,110));s.appendOccupancy(obstacle);check();
 g.context.remove(obstacle);s.refreshAfterRemoval(obstacle.id);check();
 for(let i=0;i<1100;i++)s.clearSegment(fixed({x:20+i/1000,y:30}),fixed({x:25,y:30}),undefined,{radius:.5,height:5,formationSpacing:4});
 check();
 s.heights[s.cell({x:111,y:111})]=200;s.rebuild();check();
});
