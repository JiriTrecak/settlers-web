import {TimingWindow} from './timingWindow';

/** Absolute performance timestamps share a time basis between Window and Worker. */
export type CpuSpan={source:string;start:number;end:number;tick?:number};
export type CpuBatch={since:number;through:number;dropped:number;spans:CpuSpan[]};
type Thread='browser'|'worker';
const LIMIT=20000;
const valid=(span:CpuSpan)=>Number.isFinite(span.start)&&Number.isFinite(span.end)&&span.end>=span.start;

/** Worker callback roots, drained by the next publication. The current callback
 * is unfinished, so its start (not the publication time) is the safe watermark. */
export class CpuSpanQueue {
 private spans:CpuSpan[]=[];
 private since=0;
 private dropped=0;
 enabled=false;
 configure(enabled:boolean,now:number){
  if(enabled===this.enabled)return;
  this.enabled=enabled;this.since=now;this.spans=[];this.dropped=0;
 }
 add(span:CpuSpan){if(!this.enabled||!valid(span))return;if(this.spans.length<LIMIT)this.spans.push(span);else this.dropped++;}
 drain(through:number):CpuBatch{
  const spans=this.spans;this.spans=[];
  return {since:this.since,through,dropped:this.dropped,spans};
 }
}

/** Synchronous elapsed work, not OS thread CPU time. Union roots on each thread
 * before summing threads, then integrate into equal wall-clock windows. Delivery
 * latency, GPU time, and idle gaps never enter this total. */
export class CpuBudgetCapture {
 private spans:Record<Thread,CpuSpan[]>={browser:[],worker:[]};
 private dropped=0;
 private workerDropped=0;
 private workerSince=Infinity;
 private workerThrough=-Infinity;
 constructor(readonly start:number,readonly end:number,readonly windowMs=25){}
 add(thread:Thread,span:CpuSpan){
  if(!valid(span)||span.end<=this.start||span.start>=this.end)return;
  if(this.spans[thread].length<LIMIT)this.spans[thread].push(span);else this.dropped++;
 }
 worker(batch:CpuBatch){
  if(!Number.isFinite(batch.since)||!Number.isFinite(batch.through)||batch.through<batch.since)return;
  this.workerSince=Number.isFinite(this.workerSince)?Math.max(this.workerSince,batch.since):batch.since;
  this.workerThrough=Math.max(this.workerThrough,batch.through);
  this.workerDropped=Math.max(this.workerDropped,batch.dropped);
  for(const span of batch.spans)this.add('worker',span);
 }
 report(now:number){
  const from=this.start+Math.max(0,Math.ceil((this.workerSince-this.start)/this.windowMs))*this.windowMs;
  const through=Math.min(now,this.end,this.workerThrough);
  const count=Number.isFinite(from)?Math.max(0,Math.floor((through-from)/this.windowMs)):0;
  const windows=Array.from({length:count},(_,i)=>({atMs:from-this.start+i*this.windowMs,browserMs:0,workerMs:0,totalMs:0}));
  const sourceCounts:Record<string,number>={};
  for(const thread of ['browser','worker'] as const){
   const spans=this.spans[thread].filter(s=>s.end>from&&s.start<from+count*this.windowMs).sort((a,b)=>a.start-b.start||a.end-b.end);
   const merged:Array<[number,number]>=[];
   for(const span of spans){
    sourceCounts[`${thread} · ${span.source}`]=(sourceCounts[`${thread} · ${span.source}`]??0)+1;
    const last=merged.at(-1);
    if(last&&span.start<=last[1])last[1]=Math.max(last[1],span.end);
    else merged.push([span.start,span.end]);
   }
   for(const [start,end] of merged){
    const first=Math.max(0,Math.floor((start-from)/this.windowMs)),last=Math.min(count-1,Math.ceil((end-from)/this.windowMs)-1);
    for(let i=first;i<=last;i++)windows[i]![thread==='browser'?'browserMs':'workerMs']+=Math.max(0,Math.min(end,from+(i+1)*this.windowMs)-Math.max(start,from+i*this.windowMs));
   }
  }
  const total=new TimingWindow(Math.max(1,count));
  for(const window of windows){window.totalMs=window.browserMs+window.workerMs;total.add(window.totalMs);}
  return {
   windowMs:this.windowMs,measuredMs:count*this.windowMs,stats:total.stats(),windows,
   worst:[...windows].sort((a,b)=>b.totalMs-a.totalMs).slice(0,10).map(window=>({
    ...window,
    // These describe actual overlapping roots, not the latest unrelated sample.
    // Contributor durations can nest, so only the unioned window total is additive.
    contributors:(['browser','worker'] as const).flatMap(thread=>this.spans[thread].flatMap(span=>{
     const overlapMs=Math.min(span.end,this.start+window.atMs+this.windowMs)-Math.max(span.start,this.start+window.atMs);
     return overlapMs>0?[{thread,source:span.source,tick:span.tick,elapsedMs:span.end-span.start,overlapMs}]:[];
    })).sort((a,b)=>b.overlapMs-a.overlapMs).slice(0,12),
   })),sourceCounts,
   dropped:this.dropped+this.workerDropped,
   waitingForWorkerMs:Math.max(0,Math.min(now,this.end)-(Number.isFinite(this.workerThrough)?this.workerThrough:this.start)),
   completeAccounting:false,
   note:'Correlated synchronous elapsed work per 25 ms of real time, not per-tick percentiles or OS CPU time. Nested roots are unioned per thread; simultaneous threads are added. Only full windows acknowledged by worker telemetry are included. Render draw is excluded. Canvas targeting/selection/camera, minimap, settlement HUD, hero bar, tooltip and chat input callbacks are measured, including between frames. Other UI callbacks and asynchronous continuations, native message dispatch/deserialization before callbacks, browser layout/paint, and profiler overhead are not fully covered; this is not yet the complete acceptance budget.',
  };
 }
}
