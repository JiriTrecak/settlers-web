import {expect,it} from 'vitest';
import {clearSweep,clearRay} from '../../src/sim/game/motion';
import {clearSweep as previousSweep,clearRay as previousRay} from '../fixtures/motion-sweep';

it('preserves collision results and probe order across body sizes, boundaries, slopes and blocked cells',()=>{
 let seed=1731;
 const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 const sizes=[8,64,256,512],radii=[0,1,340,499,500,595,900,1700];
 for(let i=0;i<3000;i++){
  const size=sizes[i%4]!,radius=i%2?radii[i%radii.length]!:random(2100);
  const from={x:random(size*1000+2000)-1000,y:random(size*1000+2000)-1000};
  const to=i%5?{x:from.x+random(7000)-3500,y:from.y+random(7000)-3500}:{...from};
  // Occasionally force exact grid corners and zero-length rays.
  if(i%7===0){from.x=1500;from.y=1500;to.x=4500;to.y=4500;}
  const calls:number[][]=[],expected:number[][]=[];
  const pass=(a:number,b:number)=>i%3===0||((a*17+b*31)%43!==0&&Math.abs((a%7)-(b%7))<5);
  const actual=clearSweep(from,to,(a,b)=>{calls.push([a,b]);return pass(a,b);},size,radius);
  const before=previousSweep(from,to,(a,b)=>{expected.push([a,b]);return pass(a,b);},size,radius);
  expect(actual,`sweep ${i}`).toBe(before);
  // Omitting duplicate footprint rays may remove probes, never introduce or
  // reorder them. The collision predicate is pure for the duration of a sweep.
  let cursor=0;
  for(const [a,b] of calls){
   while(cursor<expected.length&&(expected[cursor]![0]!==a||expected[cursor]![1]!==b))cursor++;
   expect(cursor,`probe order ${i}`).toBeLessThan(expected.length);cursor++;
  }
  expect(clearRay(from,to,pass,size)).toBe(previousRay(from,to,pass,size));
 }
});

it('does not trace the same large-body lattice corners and center twice',()=>{
 const from={x:10000,y:10000},to={x:11000,y:10000};
 // A 500-radius square has a 3x3 lattice. Its center and corners were
 // previously repeated, making fourteen rays where nine cover the same body.
 let probes=0,priorProbes=0;
 expect(clearSweep(from,to,()=>{probes++;return true;},64,500)).toBe(true);
 expect(previousSweep(from,to,()=>{priorProbes++;return true;},64,500)).toBe(true);
 expect(probes).toBe(18);expect(priorProbes).toBe(28);
 // Zero-size footprints are also just a center ray.
 probes=0;clearSweep(from,to,()=>{probes++;return true;},64,0);
 expect(probes).toBe(2);
});
