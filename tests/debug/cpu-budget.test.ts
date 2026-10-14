import {expect,it,vi} from 'vitest';
import {CpuBudgetCapture,CpuSpanQueue} from '../../src/debug/cpuBudget';
import {PerformanceDebug} from '../../src/debug/performance';

it('keeps callback receivers, return values and exceptions without reading the clock outside capture',()=>{
 const debug=new PerformanceDebug(),error=new Error('callback failed');
 const receiver={value:4,run:debug.cpuCallback('Input',function(this:{value:number},delta:number){this.value+=delta;return this.value;})};
 const fail=debug.cpuCallback('Input',()=>{throw error;});
 const clock=vi.spyOn(performance,'now');
 try{
  expect(receiver.run(3)).toBe(7);expect(receiver.value).toBe(7);
  expect(fail).toThrow(error);expect(clock).not.toHaveBeenCalled();
  debug.enabled=true;expect(receiver.run(1)).toBe(8);expect(clock).not.toHaveBeenCalled();
 }finally{clock.mockRestore();}
});

it('captures throwing and nested callbacks once, and excludes asynchronous waiting',async()=>{
 const debug=new PerformanceDebug();debug.enabled=true;
 let now=100;const clock=vi.spyOn(performance,'now').mockImplementation(()=>now);
 try{
  debug.capture({quiet:true,trace:false});
  const inner=debug.cpuCallback('Nested input',()=>{now+=2;throw new Error('failure');});
  const outer=debug.cpuCallback('HUD input',()=>{now+=1;try{inner();}catch{}now+=1;});
  now=105;outer(); // 4 ms inclusive, 2 ms nested: never sum them to 6.
  let resolve!:()=>void;const pending=new Promise<void>(r=>{resolve=r;});
  now=110;
  const result=debug.cpuCallback('Async input start',()=>{now+=1;return pending;})();
  expect(result).toBe(pending);
  now=150;resolve();await result;
  debug.workerCpu({since:performance.timeOrigin+100,through:performance.timeOrigin+10000,dropped:0,spans:[]});
  now=10100;debug.frame(now);
  const budget=debug.completedCapture!.cpuBudget!;
  expect(budget.stats.max).toBe(5);
  expect(budget.sourceCounts).toMatchObject({'browser · HUD input':1,'browser · Nested input':1,'browser · Async input start':1});
 }finally{clock.mockRestore();}
});

it('unions nested same-thread work and sums simultaneous work on different threads',()=>{
 const c=new CpuBudgetCapture(1000,1100);
 c.add('browser',{source:'HUD',start:1001,end:1005});
 c.add('browser',{source:'Nested send',start:1002,end:1003});
 c.add('browser',{source:'Input',start:1049,end:1052});
 c.worker({since:990,through:1100,dropped:0,spans:[{source:'Pump',start:1002,end:1008,tick:42}]});
 const r=c.report(1100);
 expect(r.windows.map(w=>[w.browserMs,w.workerMs,w.totalMs])).toEqual([[4,6,10],[1,0,1],[2,0,2],[0,0,0]]);
 expect(r.worst[0]?.contributors[0]).toMatchObject({thread:'worker',tick:42,elapsedMs:6,overlapMs:6});
 expect(r.stats.p99).toBe(10);expect(r.stats.mean).toBe(3.25);
 expect(r.completeAccounting).toBe(false);
});

it('places delayed worker samples at execution time and excludes unacknowledged trailing windows',()=>{
 const c=new CpuBudgetCapture(1000,1100);
 c.worker({since:1000,through:1060,dropped:0,spans:[{source:'Pump',start:1001,end:1010}]});
 c.add('browser',{source:'Receive',start:1070,end:1072});
 expect(c.report(1100).windows.map(w=>w.totalMs)).toEqual([9,0]);
 expect(c.report(1100).waitingForWorkerMs).toBe(40);
 c.worker({since:1000,through:1100,dropped:0,spans:[]});
 expect(c.report(1100).windows.map(w=>w.totalMs)).toEqual([9,0,2,0]);
});

it('omits partial startup windows and earlier epochs when worker profiling is restarted',()=>{
 const c=new CpuBudgetCapture(1000,1150);
 expect(c.report(1100).stats.samples).toBe(0);
 c.worker({since:1010,through:1100,dropped:0,spans:[]});
 expect(c.report(1100).windows.map(w=>w.atMs)).toEqual([25,50,75]);
 c.worker({since:1105,through:1150,dropped:0,spans:[]});
 expect(c.report(1150).windows.map(w=>w.atMs)).toEqual([125]);
});

it('bounds queue and capture memory, reports lost telemetry, and resets only on profiling changes',()=>{
 const q=new CpuSpanQueue();q.configure(true,1000);
 const span={source:'Pump',start:1001,end:1002};
 for(let i=0;i<20002;i++)q.add(span);
 q.configure(true,1003);
 const batch=q.drain(1100);expect(batch.spans).toHaveLength(20000);expect(batch.dropped).toBe(2);
 expect(q.drain(1101).spans).toHaveLength(0);
 const c=new CpuBudgetCapture(1000,1100);c.worker(batch);
 c.add('worker',span);expect(c.report(1100).dropped).toBe(3);
 q.configure(false,1102);q.add(span);expect(q.drain(1103).spans).toHaveLength(0);
 q.configure(true,1200);expect(q.drain(1250)).toEqual({since:1200,through:1250,dropped:0,spans:[]});
});

it('exports correlated CPU through quiet captures even when trace recording is disabled',()=>{
 const debug=new PerformanceDebug();debug.enabled=true;
 let now=100;const clock=vi.spyOn(performance,'now').mockImplementation(()=>now);
 try{
  debug.capture({quiet:true,trace:false});
  now=110;debug.cpuSpan('HUD',105,110);
  debug.workerCpu({since:performance.timeOrigin+100,through:performance.timeOrigin+10000,dropped:0,spans:[{source:'Pump',start:performance.timeOrigin+105,end:performance.timeOrigin+107}]});
  now=10100;debug.frame(now);
  expect(debug.completedCapture?.cpuBudget?.stats.max).toBe(7);
  expect(debug.completedCapture?.cpuBudget?.stats.samples).toBe(396);
  expect(debug.traceReport().traceEvents).toEqual([]);
  debug.cpuSpan('Late input',106,110);
  expect(debug.completedCapture?.cpuBudget?.stats.max).toBe(7);
 }finally{clock.mockRestore();}
});
