import {expect,it} from 'vitest';
import {clearSweep,clearRay} from '../../src/sim/game/motion';
import {clearSweep as previousSweep,clearRay as previousRay} from '../fixtures/motion-sweep';

it('preserves every ordered collision probe across body sizes, boundaries, slopes and blocked cells',()=>{
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
  expect(actual,`sweep ${i}`).toBe(before);expect(calls,`probes ${i}`).toEqual(expected);
  expect(clearRay(from,to,pass,size)).toBe(previousRay(from,to,pass,size));
 }
});
