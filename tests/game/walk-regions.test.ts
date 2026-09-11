import {describe,it,expect} from 'vitest';
import {WalkRegions} from '../../src/sim/game/walkRegions';
import {Navigation} from '../../src/sim/game/navigation';
describe('static navigation regions',()=>{
 it('preserves successful A* routes and rejects a separated lake island without expanding A*',()=>{
  const size=64,blocked=new Set<number>();for(let y=0;y<size;y++)blocked.add(y*size+32);
  const heights=new Int16Array(size*size),walk=(i:number)=>!blocked.has(i),regions=new WalkRegions(size,walk,heights,90);
  let probes=0;const step=(a:number,b:number)=>{probes++;return walk(b)&&Math.abs(heights[a]!-heights[b]!)<=90;};
  const nav=new Navigation(size,step,(a,b)=>regions.connected(a,b));
  expect(nav.path(0,63)).toBeNull();expect(probes).toBe(0);
  blocked.delete(32*size+32);regions.invalidate();
  expect(nav.path(0,63)).toEqual(new Navigation(size,step).path(0,63));
  blocked.add(32*size+32);regions.invalidate();expect(nav.path(0,63)).toBeNull();
 });
 it('respects cliffs and allows a unit to escape an occupied origin',()=>{
  const n=8,h=new Int16Array(n*n);for(let y=0;y<n;y++)for(let x=4;x<n;x++)h[y*n+x]=400;
  const regions=new WalkRegions(n,i=>i!==0,h,90);
  expect(regions.connected(0,3)).toBe(true);expect(regions.connected(3,7)).toBe(false);
  for(let x=0;x<n;x++)h[4*n+x]=x*60;regions.invalidate();expect(regions.connected(3,7)).toBe(true);
 });
});
