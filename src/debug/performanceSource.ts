import {perf, type PerformanceReport} from './performance';
import type {Renderer} from '../render/renderer/renderer';

type Stages = {totalMs:number;stages:{name:string;durationMs:number}[]};
export type DebugReport = {
 frames:PerformanceReport;
 capture:PerformanceReport|null;
 map?:{name:string;size:number;objects:number};
 build?:Stages;
 presentation?:Stages;
 startup?:Stages & {map?:{name:string};status:string;firstFrameMs?:number;waits:{name:string;durationMs:number}[]};
 sceneryConstruction?:ReturnType<Renderer['sceneryConstruction']>;
 renderBenchmark?:Awaited<ReturnType<Renderer['benchmarkRendering']>>;
};
/** Presentation capabilities, independent of a map editor or match implementation. */
export type PerformanceSource = {
 title:string;
 buildViews?:boolean;
 benchmark?:boolean;
 performanceReport():DebugReport;
 performanceControl(options:{action:'get'|'reset'|'capture'|'census'|'trace'|'benchmark';enabled?:boolean;width?:number;height?:number;frames?:number}):unknown;
};
export function matchPerformanceSource(title:string):PerformanceSource {
 return {
  title,
  performanceReport:()=>({frames:perf.report(),capture:perf.completedCapture}),
  performanceControl:options=>{
   if(options.enabled!==undefined&&perf.enabled!==options.enabled)perf.toggle();
   if(options.action==='reset')perf.resetTimings();
   if(options.action==='capture'||options.action==='census'){
    if(!perf.enabled)perf.toggle();
    if(options.action==='capture')perf.capture();else perf.censusPending=true;
   }
   return options.action==='trace'?perf.traceReport():perf.report();
  },
 };
}
