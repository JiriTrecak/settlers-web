import {expect,it,vi} from 'vitest';
import {PerformanceDebug} from '../../src/debug/performance';
it('isolates synchronous operation scopes without enabling frame sampling and releases captures on failure',()=>{
 const debug=new PerformanceDebug();let now=10;const clock=vi.spyOn(performance,'now').mockImplementation(()=>now);
 try{
  const measured=debug.measureSync(()=>{const outer=debug.start();now=12;const part=debug.start();now=15;debug.end('part',part);now=17;debug.end('part',part);debug.end('outer',outer);return 42;});
  expect(measured).toEqual({result:42,scopes:[{name:'part',totalMs:8,maxMs:5,count:2},{name:'outer',totalMs:7,maxMs:7,count:1}]});
  expect(debug.enabled).toBe(false);expect(debug.report().timings).toEqual({});expect(debug.start()).toBe(0);
  expect(()=>debug.measureSync(()=>{throw Error('failed');})).toThrow('failed');expect(debug.start()).toBe(0);
  expect(debug.measureSync(()=>debug.measureSync(()=>{const start=debug.start();now+=2;debug.end('nested',start);})).scopes).toEqual([{name:'nested',totalMs:2,maxMs:2,count:1}]);
 }finally{clock.mockRestore();}
});
it('compares complete captures rather than silently comparing only the last rolling window',()=>{
 const debug=new PerformanceDebug();debug.enabled=true;
 for(let i=0;i<120;i++)debug.sample('GPU frame',10);
 debug.setBaseline();debug.capture();
 for(let i=0;i<1000;i++)debug.sample('GPU frame',i<880?5:20);
 const report=debug.report();expect(report.timings['GPU frame']!.samples).toBe(1000);
 expect(report.timings['GPU frame']!.mean).toBeCloseTo(6.8);
 expect(report.comparison!['GPU frame']!.changePercent).toBeCloseTo(-32);
});
it('records bounded slow-frame evidence and ignores invalid timing samples',()=>{
 const debug=new PerformanceDebug();debug.enabled=true;
 const clock=vi.spyOn(performance,'now').mockReturnValue(100);debug.capture();
 for(let i=1;i<=80;i++){debug.sample('Simulation',4);debug.frame(100+i*40);}
 debug.sample('bad',NaN);expect(debug.report().timings.bad).toBeUndefined();
 expect(debug.report().spikes).toHaveLength(40);expect(debug.report().spikes[0]!.scopes.Simulation).toBe(4);
 clock.mockRestore();
});
it('exports measured CPU spans and separately labelled asynchronous GPU counters',()=>{
 const debug=new PerformanceDebug();debug.enabled=true;let now=100;
 const clock=vi.spyOn(performance,'now').mockImplementation(()=>now);debug.capture();
 now=103;const start=debug.start();now=107;debug.end('Scene update',start);debug.sample('GPU frame',6);debug.sample('Sim · Orders · movement',2);
 const trace=debug.traceReport();expect(trace.traceEvents).toEqual([
  {name:'Scene update',cat:'CPU',ph:'X',pid:1,tid:1,ts:3000,dur:4000},
  {name:'GPU frame',cat:'GPU result',ph:'C',pid:1,tid:2,ts:7000,args:{milliseconds:6}},
  {name:'Sim · Orders · movement',cat:'Sampled timing',ph:'C',pid:1,tid:2,ts:7000,args:{milliseconds:2}},
 ]);
 debug.capture();expect(debug.traceReport().traceEvents).toEqual([]);clock.mockRestore();
});
it('bounds trace memory while reporting dropped events',()=>{
 const debug=new PerformanceDebug();debug.enabled=true;debug.capture();
 for(let i=0;i<64010;i++)debug.sample('GPU frame',2);
 expect(debug.traceReport().traceEvents).toHaveLength(64000);expect(debug.traceReport().otherData.droppedEvents).toBe(10);
});
it('reports the 120 Hz budget and retains worst spikes instead of just the latest ones',()=>{
 const debug=new PerformanceDebug();debug.enabled=true;
 const clock=vi.spyOn(performance,'now').mockReturnValue(100);debug.capture();debug.frame(100);
 let time=100;for(const interval of [70,...Array(60).fill(10),...Array(60).fill(5)]){time+=interval;debug.frame(time);}
 const report=debug.report();expect(report.frameBudget.samples).toBe(121);expect(report.frameBudget.overBudget).toBe(61);
 expect(report.frameBudget.overBudgetPercent).toBeCloseTo(61/121*100);
 expect(report.spikes).toHaveLength(40);expect(report.spikes[0]!.frameMs).toBe(70);
 clock.mockRestore();
});
it('exports bounded independent graph series through the same report as timing statistics',()=>{
 const debug=new PerformanceDebug();debug.enabled=true;debug.capture();
 for(let i=0;i<400;i++){debug.sample('Frame interval',i);debug.sample('App frame total (CPU)',i/2);debug.sample('GPU frame',i/4);}
 const report=debug.report();
 expect(report.series['Frame interval']).toEqual(Array.from({length:120},(_,i)=>i+280));
 expect(report.series['GPU frame'].at(-1)).toBe(399/4);
 expect(report.timings['Frame interval'].samples).toBe(400);
 report.series['Frame interval'].fill(0);
 expect(debug.report().series['Frame interval'].at(-1)).toBe(399);
});
