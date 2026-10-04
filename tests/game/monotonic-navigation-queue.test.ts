import {expect,it} from 'vitest';
import {MonotonicNavigationQueue} from '../../src/sim/game/monotonicNavigationQueue';

it('matches sorted priorities across radix boundaries, ties, list reuse and reset',()=>{
 const queue=new MonotonicNavigationQueue();
 type Entry={id:number;g:number;h:number};
 const reference:Entry[]=[];
 let last=0,seed=713;
 const random=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 const push=(id:number,f:number,h:number)=>{queue.push(id,f-h,h);reference.push({id,g:f-h,h});};
 const pop=()=>{
  reference.sort((a,b)=>(a.g+a.h)-(b.g+b.h)||a.h-b.h||a.id-b.id);
  const expected=reference.shift()!,actual=queue.pop();last=expected.g+expected.h;
  expect({id:actual.id,g:actual.g}).toEqual({id:expected.id,g:expected.g});
  expect(queue.length).toBe(reference.length);
 };
 for(let i=1023;i>=0;i--)push(i,4096,i%4*1000);
 // Cross every supported signed-integer radix boundary, including large gaps.
 for(let bit=0;bit<31;bit++)for(const offset of [-1,0,1])push(random()%262144,2**bit+offset,0);
 push(262143,0x7fffffff,1000);
 for(let i=0;i<3000;i++){
  pop();const f=last+random()%4000;
  push(random()%262144,f,Math.min(f,random()%500));
  if(i%5===0)push(random()%262144,last,0);
 }
 while(reference.length)pop();
 expect(()=>queue.push(0,0,0)).toThrow('monotonic');
 queue.reset();last=0;
 push(8,10,2);push(9,12,2);pop();
 // Discard unconsumed entries and reuse their storage in a new search.
 queue.reset();reference.length=0;last=0;
 push(3,0,0);push(2,1000,0);push(1,1000,0);
 while(reference.length)pop();
 expect(()=>queue.pop()).toThrow('Empty');
 expect(()=>queue.push(0,0x80000000,0)).toThrow('signed-32-bit');
});
