import {expect,it} from 'vitest';
import {SimulationProfiler} from '../../src/sim/profiling';
import {World} from '../../src/sim/world/world';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {SimulationRuntime} from '../../src/session/worker/runtime';
import {localMatch} from '../../src/shared/match/match';

it('accounts for inclusive and self time, repeated calls and idle ticks without double counting',()=>{
 let now=0;const p=new SimulationProfiler(()=>now);p.enabled=true;
 p.measure('World',()=>{now+=1;p.measure('Ability',()=>now+=2);p.measure('Ability',()=>now+=3);now+=4;});
 expect(p.snapshot()).toEqual([{path:'World',inclusiveMs:10,selfMs:5,calls:1},{path:'World / Ability',inclusiveMs:5,selfMs:5,calls:2}]);
 p.reset();expect(p.snapshot().every(row=>row.inclusiveMs===0&&row.selfMs===0&&row.calls===0)).toBe(true);
});
it('has a clock-free disabled path, restores nesting after exceptions and preserves return values',()=>{
 let reads=0;const p=new SimulationProfiler(()=>++reads),f=p.wrap('double',(x:number)=>x*2);
 expect(f(4)).toBe(8);expect(reads).toBe(0);expect(p.snapshot()).toEqual([]);
 p.enabled=true;expect(()=>p.measure('throw',()=>{throw Error('expected');})).toThrow('expected');
 p.reset();expect(f(3)).toBe(6);expect(p.snapshot().find(r=>r.path==='double')?.calls).toBe(1);
});
it('profiling is per-world and leaves lockstep state unchanged, including restoration',()=>{
 const options={map:emptyUtcMap(),slots:[{player:0,kind:'human' as const},{player:1,kind:'ai' as const}],seed:123};
 const off=new World(options),on=new World(options);on.settlement.context.profile.enabled=true;
 for(let i=0;i<100;i++){off.tick();on.tick();}
 expect(on.checksum()).toBe(off.checksum());expect(on.checksum('full')).toBe(off.checksum('full'));expect(on.snapshot()).toEqual(off.snapshot());
 expect(on.settlement.context.profile.snapshot().some(r=>r.path.includes('Containment'))).toBe(true);
 const saved=on.snapshot();on.restore(saved);
 for(let i=0;i<50;i++){off.tick();on.tick();}
 expect(on.checksum()).toBe(off.checksum());
 expect(on.checksum('full')).toBe(off.checksum('full'));
});

it('publishes the hierarchy through the production worker frame and emits idle AI ticks as zero',()=>{
 const runtime=new SimulationRuntime({map:emptyUtcMap(),match:localMatch({mapId:'test',mapRevision:'test',seed:123,slotCount:2,me:0}),player:0,remote:false});
 runtime.profiling=true;
 try{
  let sawDecision=false,sawIdle=false;
  for(let i=0;i<30;i++){
   runtime.advance(25,1);const frame=runtime.project();
   expect(frame.droppedSamples).toBe(0);
   expect(frame.profileSamples.some(([name])=>name.includes('Detail self · World / Settlement / Ability lifecycle'))).toBe(true);
   const ai=frame.profileSamples.find(([name])=>name==='Detail inclusive · World / AI player 2');
   if(ai?.[1])sawDecision=true;
   if(sawDecision&&ai?.[1]===0)sawIdle=true;
   const root=frame.profileSamples.find(([name])=>name==='Detail inclusive · World')![1];
   const self=frame.profileSamples.filter(([name])=>name.startsWith('Detail self · World')).reduce((n,[,v])=>n+v,0);
   expect(self).toBeCloseTo(root,5);
  }
  expect(sawDecision&&sawIdle).toBe(true);
 }finally{runtime.destroy();}
});

it('samples core budgets without hierarchy overhead or stale detailed frames when modes change',()=>{
 const options={map:emptyUtcMap(),match:localMatch({mapId:'test',mapRevision:'test',seed:123,slotCount:2,me:0}),player:0,remote:false};
 const measured=new SimulationRuntime(options),plain=new SimulationRuntime(options);
 try{
  measured.configureProfiling(true,true);
  measured.advance(25,1);plain.advance(25,1);
  measured.configureProfiling(true,false);
  for(let i=0;i<20;i++){measured.advance(25,1);plain.advance(25,1);}
  const frame=measured.project();
  expect(frame.profileSamples.filter(([name])=>name==='Worker · tick total')).toHaveLength(20);
  expect(frame.profileSamples.some(([name])=>name.startsWith('Detail '))).toBe(false);
  expect(frame.profileSamples.some(([name])=>name.startsWith('Sim ·'))).toBe(true);
  expect(measured.world.settlement.context.profile.enabled).toBe(false);
  expect(measured.world.snapshot()).toEqual(plain.world.snapshot());
  measured.recordTransportSample(.25);
  expect(measured.project().profileSamples).toEqual([['Worker · snapshot postMessage CPU',.25]]);
  expect(measured.project().profileSamples).toEqual([]);
  measured.configureProfiling(true,true);measured.advance(25,1);plain.advance(25,1);
  expect(measured.project().profileSamples.some(([name])=>name.startsWith('Detail '))).toBe(true);
  measured.configureProfiling(false);measured.advance(25,1);plain.advance(25,1);
  measured.recordTransportSample(.5);
  expect(measured.project().profileSamples).toEqual([]);
  expect(measured.world.snapshot()).toEqual(plain.world.snapshot());
 }finally{measured.destroy();plain.destroy();}
});
