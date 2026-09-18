import {expect,it} from 'vitest';
import {SectorNavigation} from '../../src/sim/game/sectorNavigation';
import {Navigation,canTraverse} from '../../src/sim/game/navigation';
import {Spatial} from '../../src/sim/game/spatial';
import {ContentRegistry} from '../../src/content/registry';
import {builtinSource} from '../../src/content/builtin';
import {emptyUtcMap} from '../../src/shared/map/utcmap';

function field(size:number,blocked=new Set<number>()){
 const walk=(i:number)=>i>=0&&i<size*size&&!blocked.has(i),step=(_a:number,b:number)=>walk(b);
 const sectors=new SectorNavigation(size,walk,step),nav=new Navigation(size,step,(a,b)=>sectors.connected(a,b),true);
 sectors.prepare();return {sectors,nav,step,blocked};
}
it('keeps disconnected pieces within one sector separate and updates a new opening locally',()=>{
 const n=128,blocked=new Set<number>();for(let y=0;y<n;y++)blocked.add(y*n+7);
 const {sectors}=field(n,blocked);
 expect(sectors.connected(0,15)).toBe(false);expect(sectors.corridor(0,15)).toBeNull();
 const door=64*n+7;blocked.delete(door);sectors.invalidate([door]);sectors.prepare();
 expect(sectors.diagnostics.rebuiltSectors).toBe(1);expect(sectors.connected(0,15)).toBe(true);
 blocked.add(door);sectors.invalidate([door]);expect(sectors.connected(0,15)).toBe(false);
});
it('agrees with ordinary reachability after edits along sector edges and corners',()=>{
 const n=64,{sectors,step,blocked}=field(n),plain=new Navigation(n,step);let seed=731;
 for(let i=0;i<200;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;blocked.add(seed%(n*n));}
 sectors.invalidate();sectors.prepare();
 for(let turn=0;turn<24;turn++){
  const changed=turn%2?31*n+16:32*n+16;if(blocked.has(changed))blocked.delete(changed);else blocked.add(changed);
  sectors.invalidate([changed]);
  for(const [a,b] of [[0,n*n-1],[15*n+15,33*n+33],[31*n+15,31*n+17]])expect(sectors.connected(a!,b!)).toBe(plain.path(a!,b!)!==null);
 }
});
it('searches a narrow sector corridor around a lake and retains legal fine-grid paths',()=>{
 const n=256,blocked=new Set<number>();
 for(let y=64;y<192;y++)for(let x=96;x<160;x++)blocked.add(y*n+x);
 const {sectors,nav,step}=field(n,blocked),start=128*n+32,goal=128*n+224;
 const corridor=sectors.corridor(start,goal)!;expect(corridor).toBeTruthy();
 const routed=nav.path(start,goal,undefined,Infinity,corridor)!;expect(routed?.at(-1)).toBe(goal);
 let previous=start;for(const next of routed){expect(canTraverse(n,previous,next,step)).toBe(true);previous=next;}
 const cost=(path:number[])=>{let a=start,total=0;for(const b of path){total+=(a%n!==b%n&&Math.floor(a/n)!==Math.floor(b/n)?1414:1000);a=b;}return total;};
 const expanded=nav.lastExpanded,reference=new Navigation(n,step),optimal=reference.path(start,goal)!;
 expect(cost(routed)).toBeLessThanOrEqual(cost(optimal)*1.05);
 expect(expanded).toBeLessThan(reference.lastExpanded*.75);
 expect(sectors.diagnostics.corridorSectors).toBeLessThan(corridor.length/2);
});

it('falls back outside the preferred corridor when temporary traffic blocks its crossings',()=>{
 const spatial=new Spatial(emptyUtcMap(),new ContentRegistry(builtinSource),()=>[]),n=spatial.size;
 for(let y=64;y<192;y++)for(let x=96;x<160;x++)spatial.terrain[y*n+x]=0;
 const start=128*n+32,goal=128*n+224,corridor=spatial.sectors.corridor(start,goal)!;
 const bodies=new Set<number>();
 for(let y=0;y<n;y++){const id=y*n+128;if(corridor[spatial.sectors.sector(id)])bodies.add(id);}
 const path=spatial.findPath(start,goal,bodies)!;
 expect(path?.at(-1)).toBe(goal);expect(spatial.routing.fallbacks).toBe(1);
 expect(path.some(id=>!corridor[spatial.sectors.sector(id)])).toBe(true);
 expect(path.every(id=>!bodies.has(id)&&spatial.terrain[id]===1)).toBe(true);
});
