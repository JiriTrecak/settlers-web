import {expect,it} from 'vitest';
import {simulationWakeDelay} from '../../src/session/worker/scheduling';

it('holds a 40 Hz cadence without adding the cost of each simulation tick to its timer',()=>{
 let now=0,last=0,acc=0;
 for(let tick=1;tick<=100;tick++){
  now+=simulationWakeDelay(acc,1,now-last,false,false);
  acc+=now-last;last=now;expect(acc).toBe(25);acc-=25;
  // Simulated CPU/encoding work varies, but the next deadline stays exact.
  expect(now).toBe(tick*25);now+=tick%3===0?12:5;
 }
});

it('backs off missing commits, preserves catch-up work, and handles speed and pause',()=>{
 expect(simulationWakeDelay(25,1,10,false,true)).toBe(25);
 expect(simulationWakeDelay(50,1,2,false,false)).toBe(0);
 expect(simulationWakeDelay(0,2,4,false,false)).toBe(8.5);
 expect(simulationWakeDelay(0,1,100,true,false)).toBe(25);
 expect(simulationWakeDelay(0,1,-10,false,false)).toBe(25);
});
