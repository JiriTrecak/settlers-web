import {TimingWindow} from './timingWindow';
import type {DrawCensus} from './drawCensus';
import {shortcuts,inputCaptured} from '../shared/input/shortcuts';
type TraceEvent={name:string;cat:string;ph:'X'|'C';pid:number;tid:number;ts:number;dur?:number;args?:Record<string,number>};
const MAX_TRACE_EVENTS=64000;
const FRAME_BUDGET_MS=1000/120;
export type ScopeMeasurement={name:string;totalMs:number;maxMs:number;count:number};
export type PerformanceReport={sampling:{simulationDetails:boolean;quiet:boolean;trace:boolean};series:Record<string,number[]>;frameBudget:{targetMs:number;samples:number;overBudget:number;overBudgetPercent:number;refreshMs:number;missed:number;missedPercent:number};census?:DrawCensus;shaderLinks?:Array<{atMs:number;name:string;key:string}>;note:string;values:Record<string,string|number>;timings:Record<string,ReturnType<TimingWindow['stats']>>;capturedMs?:number;spikes:Array<{atMs:number;frameMs:number;scopes:Record<string,number>}>;comparison?:Record<string,{baselineMean:number|undefined;currentMean:number;changePercent:number|null}>};
export type MatchDebugControls = {
  reveal: boolean;
  speed: number;
  remote: boolean;
  visionPlayer: number;
  players: readonly { player: number; name?: string }[];
  onReveal(value: boolean): void;
  onSpeed(value: number): void;
  onVision(player: number): void;
  /** Benchmark hooks (`utcPerformance.match` in the console / CDP scripts): capture or resume
   * an exact match state and frame the camera, so perf runs are repeatable. */
  snapshot(): Promise<unknown>;
  restore(save: unknown): Promise<void>;
  lookAt(x: number, y: number, distance?: number): void;
  /** Navigation overlays are opt-in independently of the timing sampler. */
  paths: boolean;
  worldGrid: boolean;
  walkability: boolean;
  navmesh: boolean;
  onPaths(value: boolean): void;
  onWorldGrid(value: boolean): void;
  onWalkability(value: boolean): void;
  onNavmesh(value: boolean): void;
};
/** Opt-in profiler. CPU scopes overlap; GPU samples arrive asynchronously. */
export class PerformanceDebug {
  enabled = false;
  detailedSimulation = true;
  private synchronousCaptures=new Set<Map<string,ScopeMeasurement>>();
  get capturingSync(){return this.synchronousCaptures.size>0;}
  /** Capture one synchronous operation without enabling the rolling frame profiler.
   * Nested CPU scopes overlap; totals must not be added together. */
  measureSync<T>(work:()=>T):{result:T;scopes:ScopeMeasurement[]}{
    const scopes=new Map<string,ScopeMeasurement>();this.synchronousCaptures.add(scopes);
    try{return {result:work(),scopes:[...scopes.values()]};}
    finally{this.synchronousCaptures.delete(scopes);}
  }
  private matchControls: MatchDebugControls | null = null;
  get match() { return this.matchControls; }
  bindMatch(controls: MatchDebugControls): () => void {
    this.matchControls = controls;
    return () => { if (this.matchControls === controls) this.matchControls = null; };
  }

  private rows = new Map<string, TimingWindow>();
  private recording:Map<string,TimingWindow>|null=null;
  private captureStart=0;private captureEnd=0;
  private captureOptions={quiet:false,trace:true,simulationDetails:true};
  private captureResult:PerformanceReport|null=null;
  get completedCapture(){return this.captureResult;}
  /** Set by the Draw census button; the display consumes it on its next frame. */
  censusPending=false;
  census:DrawCensus|null=null;
  takeCensus(){if(!this.enabled||!this.censusPending)return false;this.censusPending=false;return true;}
  setCensus(census:DrawCensus){this.census=census;console.table(census.rows.slice(0,40));}
  private baseline:PerformanceReport|null=null;
  private latest:Record<string,number>={};
  private spikes:Array<{atMs:number;frameMs:number;scopes:Record<string,number>}>=[];
  private traceEvents:TraceEvent[]=[];
  private traceDropped=0;
  private trace(event:TraceEvent){if(this.traceEvents.length<MAX_TRACE_EVENTS)this.traceEvents.push(event);else this.traceDropped++;}
  traceReport(){return {traceEvents:[...this.traceEvents],displayTimeUnit:'ms',otherData:{droppedEvents:this.traceDropped,note:'CPU scopes are measured spans and may nest. Counters are sampled results at delivery time, not execution spans; GPU results arrive asynchronously.'}};}
  setBaseline(){this.baseline=this.captureResult??this.report();}
  capture(options:{quiet?:boolean;trace?:boolean}={}){this.captureOptions={quiet:options.quiet??false,trace:options.trace??true,simulationDetails:this.detailedSimulation};this.traceEvents=[];this.traceDropped=0;this.recording=new Map();this.captureStart=performance.now();this.captureEnd=this.captureStart+10000;this.spikes=[];this.captureResult=null;}
  private snapshot(rows:Map<string,TimingWindow>){return Object.fromEntries([...rows].map(([k,v])=>[k,v.stats()]));}
  private values: Record<string, string | number> = {};
  private presentationToggle:(()=>void)|undefined;
  /** One shared UI owns presentation; sampling and MCP remain independently usable. */
  bindPresentation(toggle:()=>void):()=>void {
    this.presentationToggle=toggle;
    return ()=>{if(this.presentationToggle===toggle)this.presentationToggle=undefined;};
  }
  get quietCapture(){return !!this.recording&&this.captureOptions.quiet;}
  private counts: Record<string, number> = {};
  resetTimings(){this.rows.clear();this.latest={};this.lastFrame=0;}
  resetCounts() {
    if (this.enabled) {
      for (const name of Object.keys(this.counts)) this.values[name] = 0;
      this.counts = {};
    }
  }
  count(name: string, value: number) {
    if (this.enabled) this.counts[name] = (this.counts[name] ?? 0) + value;
  }
  finishCounts() {
    if (this.enabled)
      for (const [k, v] of Object.entries(this.counts))
        this.values[k] = Math.round(v).toLocaleString();
  }
  private lastFrame = 0;
  private refs = 0;
  private key = (e: KeyboardEvent) => {
    if (!inputCaptured(e) && !e.repeat && shortcuts.matches("debug.toggle",e)) {
      e.preventDefault();
      if(this.presentationToggle)this.presentationToggle();else this.toggle();
    }
  };
  attach() {
    if (document.documentElement.dataset.profiler === "off") return;
    if (this.refs++ > 0) return;
    try {
      this.enabled =
        localStorage.getItem("utc.debug.performance") === "true" ||
        new URLSearchParams(location.search).has("debug");
    } catch {}
    window.addEventListener("keydown", this.key);
    Object.assign(window, { utcPerformance: this });
  }
  detach() {
    if (this.refs===0 || --this.refs > 0) return;
    window.removeEventListener("keydown", this.key);
    this.rows.clear();
    this.recording=null;this.captureResult=null;this.baseline=null;this.latest={};this.spikes=[];this.traceEvents=[];
    this.values = {};
    this.lastFrame = 0;
  }
  toggle() {
    this.enabled = !this.enabled;
    this.rows.clear();
    this.recording=null;this.latest={};this.spikes=[];
    this.lastFrame = 0;
    try {
      localStorage.setItem("utc.debug.performance", String(this.enabled));
    } catch {}

  }
  start() {
    return this.enabled||this.synchronousCaptures.size ? performance.now() : 0;
  }
  end(name: string, start: number) {
    if ((!this.enabled&&!this.synchronousCaptures.size) || !start)return;
    const now=performance.now(),ms=now-start;
    for(const capture of this.synchronousCaptures){const scope=capture.get(name)??{name,totalMs:0,maxMs:0,count:0};scope.totalMs+=ms;scope.maxMs=Math.max(scope.maxMs,ms);scope.count++;capture.set(name,scope);}
    this.sample(name,ms);
    if(this.recording&&this.captureOptions.trace){const from=Math.max(start,this.captureStart);this.trace({name,cat:'CPU',ph:'X',pid:1,tid:1,ts:(from-this.captureStart)*1000,dur:Math.max(0,now-from)*1000});}
  }
  sample(name: string, ms: number) {
    if (!this.enabled) return;
    if(!Number.isFinite(ms)||ms<0)return;
    let a=this.rows.get(name);if(!a){a=new TimingWindow();this.rows.set(name,a);}a.add(ms);this.latest[name]=ms;
    if(this.recording&&this.captureOptions.trace&&(name.startsWith('GPU ')||name.startsWith('Sim · ')||name.startsWith('AI decision · ')||name==='Frame interval'))
      this.trace({name,cat:name.startsWith('GPU ')?'GPU result':'Sampled timing',ph:'C',pid:1,tid:2,ts:(performance.now()-this.captureStart)*1000,args:{milliseconds:ms}});
    if(this.recording){let r=this.recording.get(name);if(!r){r=new TimingWindow(4096);this.recording.set(name,r);}r.add(ms);}
  }

  value(name: string, value: string | number) {
    if (this.enabled) this.values[name] = value;
  }
  /** Programs linked after warm-up. Each one is a main-thread stall (tens of ms), so these are
   * recorded even with the panel closed; the renderer reports only newly created programs. */
  readonly shaderLinks: Array<{ atMs: number; name: string; key: string }> = [];
  shaderLink(name: string, key: string) {
    if (this.shaderLinks.length < 200) this.shaderLinks.push({ atMs: Math.round(performance.now()), name, key: key.slice(0, 600) });
    console.debug(`[perf] late shader link: ${name}`, key.slice(0, 600));
    this.values["Late shader links"] = this.shaderLinks.length;
  }
  report():PerformanceReport {
    const frames=(this.recording??this.rows).get('Frame interval')?.values()??[];
    const overBudget=frames.filter(ms=>ms>FRAME_BUDGET_MS).length;
    // Presentation jitter puts half of all vsync-locked intervals just above the budget, so
    // real hitches are counted against the median interval (the display's refresh period).
    const refreshMs=[...frames].sort((a,b)=>a-b)[frames.length>>1]??FRAME_BUDGET_MS,missed=frames.filter(ms=>ms>refreshMs*1.5).length;
    return {
      sampling:this.recording?{...this.captureOptions}:{simulationDetails:this.detailedSimulation,quiet:false,trace:false},
      series:Object.fromEntries(['Frame interval','App frame total (CPU)','GPU frame'].map(name=>[name,(this.recording??this.rows).get(name)?.values().slice(-120)??[]])),
      frameBudget:{targetMs:FRAME_BUDGET_MS,samples:frames.length,overBudget,overBudgetPercent:frames.length?100*overBudget/frames.length:0,refreshMs,missed,missedPercent:frames.length?100*missed/frames.length:0},
      census:this.census??undefined,
      shaderLinks:this.shaderLinks.length?[...this.shaderLinks]:undefined,
      note: "CPU scopes overlap; GPU is asynchronous. Timings are milliseconds over the last 120 samples or a 10-second capture (4096 samples per scope maximum). Spikes contain the latest scope samples, not a causal trace; GPU results arrive late. Counters describe the last frame; category triangles cover color passes, while total triangles include shadows and reflections.",
      values: {...this.values},
      capturedMs:this.recording?performance.now()-this.captureStart:undefined,
      timings:this.snapshot(this.recording??this.rows),
      spikes:[...this.spikes],
      comparison:this.baseline?Object.fromEntries([...(this.recording??this.rows)].map(([k,v])=>{const current=v.stats().mean,old=this.baseline!.timings[k]?.mean;return [k,{baselineMean:old,currentMean:current,changePercent:old?100*(current-old)/old:null}];})):undefined,
    };
  }

  frame(now: number) {
    if (!this.enabled) return;
    if (this.lastFrame && now > this.lastFrame){
      const ms=now-this.lastFrame;this.sample('Frame interval',ms);
      if(this.recording&&ms>FRAME_BUDGET_MS){this.spikes.push({atMs:now-this.captureStart,frameMs:ms,scopes:{...this.latest}});this.spikes.sort((a,b)=>b.frameMs-a.frameMs);if(this.spikes.length>40)this.spikes.length=40;}
    }
    if(this.recording&&now>=this.captureEnd){this.captureResult=this.report();this.recording=null;}
    this.lastFrame = now;
  }
}
export const perf = new PerformanceDebug();
