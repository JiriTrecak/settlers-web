import {expect,it,vi} from 'vitest';
import {LocalTerrainSweeps} from '../../src/sim/game/localTerrainSweeps';
import {clearSweep,type FixedPoint} from '../../src/sim/game/motion';
import {game,placed} from './helpers';

it('matches uncached directed sweeps on quarter steps, arbitrary endpoints and multiple body sizes',()=>{
 let seed=871;const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(const size of [8,65])for(const radius of [0,340,500,595,1700,3100]){
  const heights=Int16Array.from({length:size*size},()=>random(180));
  const blocked=new Set(Array.from({length:Math.ceil(size*size/30)},()=>random(size*size)));
  const step=(a:number,b:number)=>!blocked.has(b)&&heights[b]!-heights[a]!<=90;
  const cache=new LocalTerrainSweeps(size,radius,step);
  const queries:{from:FixedPoint;to:FixedPoint}[]=[];
  for(let i=0;i<500;i++){
   const from={x:random(size*4)*250,y:random(size*4)*250};
   const stride=1+random(10);
   const to={x:from.x+(random(3)-1)*250*stride,y:from.y+(random(3)-1)*250*stride};
   if(i%5===0)from.x+=117;
   if(i%7===0)to.y+=1350;
   queries.push({from,to});
  }
  for(let pass=0;pass<3;pass++){
   for(const {from,to} of queries)expect(cache.clear(from,to)).toBe(clearSweep(from,to,step,size,radius));
   const cell=random(size*size),cells=[cell,cell,Math.min(size*size-1,cell+1),random(size*size)];
   for(const changed of cells){blocked.add(changed);heights[changed]=450;}cache.invalidate(cells);
  }
 }
});

it('reuses exact edges and invalidates a footprint halo without discarding remote tiles',()=>{
 const size=64,blocked=new Set<number>(),step=vi.fn((_a:number,b:number)=>!blocked.has(b));
 const cache=new LocalTerrainSweeps(size,1700,step),from={x:15750,y:16000},to={x:16000,y:16250};
 const remote={x:48000,y:48000};
 expect(cache.clear(from,to)).toBe(true);expect(cache.clear(remote,remote)).toBe(true);
 step.mockClear();expect(cache.clear(from,to)).toBe(true);expect(step).not.toHaveBeenCalled();
 const obstruction=16*size+17;blocked.add(obstruction);cache.invalidate([obstruction]);
 expect(cache.clear(remote,remote)).toBe(true);expect(step).not.toHaveBeenCalled();
 expect(cache.clear(from,to)).toBe(false);expect(step).toHaveBeenCalled();
 blocked.clear();cache.invalidate([obstruction]);expect(cache.clear(from,to)).toBe(true);
 cache.invalidate();step.mockClear();expect(cache.clear(remote,remote)).toBe(true);expect(step).toHaveBeenCalled();
});

it('tracks live reservations, building additions/removals and explicit terrain rebuilds',()=>{
 const g=game([placed('actor','unit.ants.warrior',110,110)]),s=g.spatial,e=g.entities.find(e=>e.placement==='actor')!;
 const blocked=new Set<number>(),from={x:110000,y:110000},to={x:110250,y:110250};
 const verify=()=>expect(s.clearLocalSegment(from,to,blocked,e)).toBe(s.clearSegment(from,to,blocked,e));
 verify();blocked.add(s.cell(e));verify();blocked.clear();verify();
 const building=g.context.create(placed('obstacle','building.ants.house',110,110));s.appendOccupancy(building);
 verify();expect(s.clearLocalSegment(from,to,blocked,e)).toBe(false);
 g.context.remove(building);s.refreshAfterRemoval(building.id);verify();expect(s.clearLocalSegment(from,to,blocked,e)).toBe(true);
 s.terrain[s.cell(e)]=0;s.rebuild();verify();expect(s.clearLocalSegment(from,to,blocked,e)).toBe(false);
});

it('bounds retained work while armies explore many distant regions',()=>{
 const step=vi.fn(()=>true),cache=new LocalTerrainSweeps(512,595,step),first={x:1000,y:1000};
 expect(cache.clear(first,first)).toBe(true);
 for(let i=1;i<=160;i++){
  const p={x:(i%32)*8000+1000,y:Math.floor(i/32)*8000+1000};
  expect(cache.clear(p,p)).toBe(true);
 }
 step.mockClear();expect(cache.clear(first,first)).toBe(true);
 // An old remote region is recomputed, rather than retaining a growing field.
 expect(step).toHaveBeenCalled();
});


it('caches larger local steps separately and invalidates obstructions anywhere along their footprint',()=>{
 const size=64,blocked=new Set<number>(),step=vi.fn((_a:number,b:number)=>!blocked.has(b));
 const cache=new LocalTerrainSweeps(size,1700,step),from={x:15500,y:16000};
 const targets=[{x:15750,y:16000},{x:16000,y:16000},{x:16250,y:16750},{x:17500,y:18000}];
 for(const to of targets)expect(cache.clear(from,to)).toBe(clearSweep(from,to,step,size,1700));
 step.mockClear();for(const to of targets)expect(cache.clear(from,to)).toBe(true);
 expect(step).not.toHaveBeenCalled();
 // This cell reaches only the long edge. Invalidating a quarter-step halo
 // alone would leave a stale clear result in the previous tile.
 const obstruction=19*size+19;blocked.add(obstruction);cache.invalidate([obstruction]);
 for(const to of targets)expect(cache.clear(from,to)).toBe(clearSweep(from,to,step,size,1700));
 expect(cache.clear(from,targets[3]!)).toBe(false);
 blocked.clear();cache.invalidate([obstruction]);
 expect(cache.clear(from,targets[3]!)).toBe(true);
});
