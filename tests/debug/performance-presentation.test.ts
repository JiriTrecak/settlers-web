import {afterEach,expect,it,vi} from 'vitest';
import {PerformanceDebug,perf} from '../../src/debug/performance';
import {matchPerformanceSource} from '../../src/debug/performanceSource';

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();perf.enabled=false;perf.resetTimings();});
function browser(){
 const target=new EventTarget();
 vi.stubGlobal('window',target);
 vi.stubGlobal('document',{documentElement:{dataset:{}},querySelector:()=>null});
 vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{}});
 vi.stubGlobal('location',{search:''});
 return {key:()=>target.dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{key:'F3',code:'F3',ctrlKey:true,altKey:false,shiftKey:false,metaKey:false,repeat:false}))};
}
it('binds one presentation across nested displays and releases keyboard handlers on final detach',()=>{
 const {key}=browser(),debug=new PerformanceDebug(),old=vi.fn(),current=vi.fn();
 debug.attach();debug.attach();
 const releaseOld=debug.bindPresentation(old),release=debug.bindPresentation(current);
 releaseOld();key();expect(old).not.toHaveBeenCalled();expect(current).toHaveBeenCalledTimes(1);expect(debug.enabled).toBe(false);
 debug.detach();key();expect(current).toHaveBeenCalledTimes(2);
 release();key();expect(debug.enabled).toBe(true);
 debug.detach();key();expect(debug.enabled).toBe(true);
 debug.detach();debug.attach();key();expect(debug.enabled).toBe(true);debug.detach();
});
it('keeps capture, census and exports on the same sampler used by matches and MCP',()=>{
 browser();const source=matchPerformanceSource('Test match');
 source.performanceControl({action:'get',enabled:true});
 perf.sample('Simulation',2);expect(source.performanceReport().frames.timings.Simulation.mean).toBe(2);
 source.performanceControl({action:'census'});expect(perf.takeCensus()).toBe(true);expect(perf.takeCensus()).toBe(false);
 source.performanceControl({action:'capture'});perf.sample('GPU frame',3);
 expect(source.performanceReport().frames.capturedMs).toBeDefined();
 expect(source.performanceControl({action:'trace'})).toEqual(perf.traceReport());
 source.performanceControl({action:'get',enabled:false});expect(perf.enabled).toBe(false);
 source.performanceControl({action:'reset'});expect(source.performanceReport().frames.timings).toEqual({});
});
it('exposes quiet recording state without polling or a DOM renderer and releases it on completion',()=>{
 const debug=new PerformanceDebug();debug.enabled=true;const clock=vi.spyOn(performance,'now').mockReturnValue(100);
 debug.capture({quiet:true,trace:false});expect(debug.quietCapture).toBe(true);
 debug.sample('Simulation',2);clock.mockReturnValue(10200);debug.frame(10200);
 expect(debug.quietCapture).toBe(false);expect(debug.completedCapture?.timings.Simulation.mean).toBe(2);
});
