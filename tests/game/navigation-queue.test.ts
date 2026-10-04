import {expect,it} from 'vitest';
import {NavigationQueue} from '../../src/sim/game/navigationQueue';

it('matches an independently sorted frontier through ties, growth, stale entries and search resets',()=>{
 const queue=new NavigationQueue();
 type Entry={id:number;g:number;h:number};
 const reference:Entry[]=[];
 const compare=(a:Entry,b:Entry)=>(a.g+a.h)-(b.g+b.h)||a.h-b.h||a.id-b.id;
 const push=(entry:Entry)=>{reference.push(entry);queue.push(entry.id,entry.g,entry.h);};
 const pop=()=>{
  reference.sort(compare);const expected=reference.shift()!,actual=queue.pop();
  expect({id:actual.id,g:actual.g}).toEqual({id:expected.id,g:expected.g});
  expect(queue.length).toBe(reference.length);
 };
 // Equal f with different h, then identical priorities with different cells.
 for(let id=1023;id>=0;id--)push({id,g:100000-id%4*1000,h:id%4*1000});
 let seed=19;
 for(let i=0;i<2000;i++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  push({id:seed%262144,g:(seed%2000)*1000,h:(seed%300)*1414});
  if(i%3===0)pop();
 }
 while(reference.length)pop();
 // A successful search can stop with an unconsumed frontier.
 push({id:8,g:1,h:1});push({id:9,g:2,h:1});
 queue.length=0;reference.length=0;
 push({id:262143,g:900000000,h:123456});push({id:0,g:1,h:0});
 while(reference.length)pop();
});
