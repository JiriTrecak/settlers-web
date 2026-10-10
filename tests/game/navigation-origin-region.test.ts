import {expect,it} from 'vitest';
import {Navigation} from '../../src/sim/game/navigation';

it('reuses only an exhausted unrestricted origin region, preserving directed reachability',()=>{
 const size=48,start=10*size+5,goal=10*size+40;
 // Crossing east is forbidden; crossing west is allowed.
 const nav=new Navigation(size,(a,b)=>!(a%size<24&&b%size>=24),undefined,true);
 expect(nav.path(start,goal,undefined,Infinity,undefined,1000,16,true)).toBeNull();
 expect(nav.knownUnreachable(start,goal)).toBe(true);
 expect(nav.knownUnreachable(start,12*size+6)).toBe(false);
 // Never infer that the reverse journey is also impossible.
 expect(nav.knownUnreachable(goal,start)).toBe(false);
 expect(nav.path(goal,start)).not.toBeNull();
 // An unrelated query must not corrupt the previously proved region.
 expect(nav.knownUnreachable(start,goal)).toBe(true);
});
it('invalidates a remembered region when an obstacle is removed',()=>{
 const size=48,start=10*size+5,goal=10*size+40;let closed=true;
 const nav=new Navigation(size,(_a,b)=>!closed||b%size!==24,undefined,true);
 expect(nav.path(start,goal,undefined,Infinity,undefined,1000,16,true)).toBeNull();
 expect(nav.knownUnreachable(start,goal)).toBe(true);
 closed=false;nav.invalidate(Array.from({length:size},(_,y)=>y*size+24));
 expect(nav.knownUnreachable(start,goal)).toBe(false);
 expect(nav.path(start,goal)).not.toBeNull();
});
it('never remembers corridor, cost-limited or temporary-blocker failures as permanent terrain facts',()=>{
 const size=48,start=10*size+5,goal=10*size+40;
 for(const mode of ['corridor','cost','blocked']){
  const nav=new Navigation(size,()=>true,undefined,true);
  const blockers=mode==='blocked'?new Set(Array.from({length:size},(_,y)=>y*size+24)):undefined;
  const corridor=mode==='corridor'?new Uint8Array(Math.ceil(size/16)**2).fill(0):undefined;
  expect(nav.path(start,goal,blockers,mode==='cost'?1000:Infinity,corridor,1000,16,true)).toBeNull();
  expect(nav.knownUnreachable(start,goal)).toBe(false);
  expect(nav.path(start,goal)).not.toBeNull();
 }
});
