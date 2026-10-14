import {expect,it,vi} from 'vitest';
import {TerrainStepCache} from '../../src/sim/game/terrainStepCache';
import {adjacentSweep} from '../../src/sim/game/adjacentSweep';

it('retains exact directed footprint checks through warm queries and local terrain edits',()=>{
 let seed=917;const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(const size of [17,65])for(const radius of [0,340,500,1500,3100]){
  const heights=Int16Array.from({length:size*size},()=>random(150)),blocked=new Set<number>();
  const raw=adjacentSweep(size,radius,(a,b)=>!blocked.has(b)&&heights[b]!-heights[a]!<=90);
  const cache=new TerrainStepCache(size,Math.ceil(radius/1000)+1,raw);
  const queries=Array.from({length:600},()=>{
   const from=random(size*size),dx=random(3)-1,dy=random(3)-1;
   return [from,from+dy*size+dx] as const;
  });
  // Include stationary footprint checks and all directions at tile boundaries.
  for(const x of [0,15,16,size-1])for(const y of [0,15,16,size-1])
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)queries.push([y*size+x,(y+dy)*size+x+dx]);
  for(let pass=0;pass<4;pass++){
   for(const [a,b] of queries)expect(cache.clear(a,b)).toBe(raw(a,b));
   const cell=random(size*size),cells=[cell,cell,Math.min(size*size-1,cell+1),random(size*size)];
   for(const changed of cells){blocked.add(changed);heights[changed]=300;}cache.invalidate(cells);
  }
  blocked.clear();heights.fill(0);cache.invalidate();
  for(const [a,b] of queries)expect(cache.clear(a,b)).toBe(raw(a,b));
 }
});

it('invalidates the body halo across tile boundaries while retaining remote results',()=>{
 const size=96,blocked=new Set<number>();
 const raw=vi.fn(adjacentSweep(size,1700,(_a,b)=>!blocked.has(b)));
 const cache=new TerrainStepCache(size,3,raw),near=30*size+31,remote=80*size+80;
 expect(cache.clear(near,near+1)).toBe(true);expect(cache.clear(remote,remote)).toBe(true);
 raw.mockClear();expect(cache.clear(near,near+1)).toBe(true);expect(raw).not.toHaveBeenCalled();
 const cell=30*size+33;blocked.add(cell);cache.invalidate([cell]);
 expect(cache.clear(remote,remote)).toBe(true);expect(raw).not.toHaveBeenCalled();
 expect(cache.clear(near,near+1)).toBe(false);expect(raw).toHaveBeenCalledTimes(1);
 blocked.clear();cache.invalidate([cell]);expect(cache.clear(near,near+1)).toBe(true);
});

it('bounds retained regions instead of allocating a full field for each body size',()=>{
 const size=1024,step=vi.fn(()=>true),cache=new TerrainStepCache(size,2,step),first=1*size+1;
 cache.clear(first,first);
 for(let i=1;i<=256;i++){const cell=(Math.floor(i/64)*16+1)*size+(i%64)*16+1;cache.clear(cell,cell);}
 step.mockClear();cache.clear(first,first);expect(step).toHaveBeenCalledTimes(1);
});

