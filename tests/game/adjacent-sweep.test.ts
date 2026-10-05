import {expect,it} from 'vitest';
import {adjacentSweep} from '../../src/sim/game/adjacentSweep';
import {clearSweep} from '../../src/sim/game/motion';

it('matches footprint sweeps on boundaries, directed slopes, obstacles and multiple body sizes',()=>{
 let seed=1791;
 const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(const size of [1,2,8,64,512])for(const radius of [0,1,340,499,500,595,900,1700,3100,16000]){
  let salt=0;
  const queries:number[][]=[];
  const step=(a:number,b:number)=>{queries.push([a,b]);return salt===0||((a*17+b*31+salt)%43!==0&&Math.abs((a%7)-(b%7))<5);};
  const fast=adjacentSweep(size,radius,step);
  for(let i=0;i<100;i++){
   const x=i<25?i%size:random(size),y=i<25?Math.floor(i/size)%size:random(size);
   const dx=random(3)-1,dy=random(3)-1,tx=x+dx,ty=y+dy;
   if(tx<0||ty<0||tx>=size||ty>=size)continue;
   // Change the predicate while reusing geometry; terrain results must stay live.
   salt=i%3?i:0;queries.length=0;
   const expected=clearSweep({x:x*1000,y:y*1000},{x:tx*1000,y:ty*1000},step,size,radius);
   const required=new Set(queries.map(p=>p.join(':')));queries.length=0;
   expect(fast(y*size+x,ty*size+tx),`${size}/${radius}/${x},${y}/${dx},${dy}/${salt}`).toBe(expected);
   // Successful unblocked queries must cover every distinct original edge.
   if(expected)expect(new Set(queries.map(p=>p.join(':')))).toEqual(required);
  }
 }
});

it('deduplicates footprint rays while checking current obstacles',()=>{
 const size=64,from=32*size+32,to=from+size+1,blocked=new Set<number>();let queries=0;
 const step=(_a:number,b:number)=>{queries++;return !blocked.has(b);};
 expect(clearSweep({x:32000,y:32000},{x:33000,y:33000},step,size,595)).toBe(true);
 const baseline=queries;queries=0;
 const fast=adjacentSweep(size,595,step);
 expect(fast(from,to)).toBe(true);expect(queries).toBeLessThan(baseline);
 blocked.add(from+1);expect(fast(from,to)).toBe(false);
 blocked.clear();expect(fast(from,to)).toBe(true);
 expect(fast(from,from+3)).toBe(false);
});
