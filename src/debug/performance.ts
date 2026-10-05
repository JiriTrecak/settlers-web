import {TimingWindow} from './timingWindow';
import type {DrawCensus} from './drawCensus';
import {shortcuts,inputCaptured} from '../shared/input/shortcuts';
type TraceEvent={name:string;cat:string;ph:'X'|'C';pid:number;tid:number;ts:number;dur?:number;args?:Record<string,number>};
const MAX_TRACE_EVENTS=64000;
const FRAME_BUDGET_MS=1000/120;
export type ScopeMeasurement={name:string;totalMs:number;maxMs:number;count:number};
type PerformanceReport={sampling:{simulationDetails:boolean;quiet:boolean;trace:boolean};series:Record<string,number[]>;frameBudget:{targetMs:number;samples:number;overBudget:number;overBudgetPercent:number;refreshMs:number;missed:number;missedPercent:number};census?:DrawCensus;shaderLinks?:Array<{atMs:number;name:string;key:string}>;note:string;values:Record<string,string|number>;timings:Record<string,ReturnType<TimingWindow['stats']>>;capturedMs?:number;spikes:Array<{atMs:number;frameMs:number;scopes:Record<string,number>}>;comparison?:Record<string,{baselineMean:number|undefined;currentMean:number;changePercent:number|null}>};
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
  /** Navigation overlay toggles; only polled while the profiler panel is enabled. */
  paths: boolean;
  walkability: boolean;
  navmesh: boolean;
  onPaths(value: boolean): void;
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
  private controls: HTMLElement | null = null;
  bindMatch(controls: MatchDebugControls): () => void {
    this.matchControls = controls;
    this.renderControls();
    return () => {
      if (this.matchControls === controls) {
        this.matchControls = null;
        this.controls?.remove();
        this.controls = null;
        this.navigationStatus = null;
      }
    };
  }
  private renderControls() {
    this.controls?.remove();
    this.controls = null;
    this.navigationStatus = null;
    const spec = this.matchControls;
    if (!this.panel || !spec) return;
    const box = document.createElement("section");
    this.controls = box;
    box.setAttribute("aria-label", "Match debug controls");
    box.style.cssText =
      "background:#10191af2;border:1px solid #53676b;padding:10px 12px;margin-top:5px;display:grid;gap:8px";
    const reveal = document.createElement("label"),
      check = document.createElement("input");
    check.type = "checkbox";
    check.checked = spec.reveal;
    check.disabled = spec.remote;
    check.onchange = () => {
      spec.reveal = check.checked;
      spec.onReveal(check.checked);
    };
    reveal.append(check, " Reveal map (visual only)");
    const speed = document.createElement("label"),
      select = document.createElement("select");
    select.setAttribute("aria-label", "Match speed");
    for (const n of [1, 2, 3, 4]) {
      const o = document.createElement("option");
      o.value = String(n);
      o.textContent = n + "×";
      select.append(o);
    }
    select.value = String(spec.speed);
    select.disabled = spec.remote;
    select.onchange = () => {
      spec.speed = Number(select.value);
      spec.onSpeed(spec.speed);
    };
    speed.append("Match speed  ", select);
    const vision = document.createElement("label"),
      players = document.createElement("select");
    players.setAttribute("aria-label", "Fog perspective");
    for (const p of spec.players) {
      const o = document.createElement("option");
      o.value = String(p.player);
      o.textContent = "Player " + (p.player + 1);
      players.append(o);
    }
    players.value = String(spec.visionPlayer);
    players.disabled = spec.remote;
    players.onchange = () => {
      spec.visionPlayer = Number(players.value);
      spec.onVision(spec.visionPlayer);
    };
    vision.append("Fog perspective  ", players);
    const toggle = (text: string, value: boolean, set: (value: boolean) => void) => {
      const label = document.createElement("label"),
        input = document.createElement("input");
      input.type = "checkbox";
      input.checked = value;
      input.onchange = () => set(input.checked);
      label.append(input, text);
      return label;
    };
    const paths = toggle(" Show unit paths", spec.paths, (v) => {
      spec.paths = v;
      spec.onPaths(v);
    });
    const walkability = toggle(" Show walkable / blocked cells", spec.walkability, (v) => {
      spec.walkability = v;
      spec.onWalkability(v);
    });
    const hint = document.createElement("small");
    const meshStatus=this.navigationStatus=document.createElement("small");
    meshStatus.textContent="Ground routing mesh; bridge decks use the surface solver.";
    meshStatus.style.cssText="color:#75cddb;line-height:1.4;overflow-wrap:anywhere";
    meshStatus.hidden=!spec.navmesh;
    const navmesh = toggle(" Show ground navmesh (cyan)", spec.navmesh, (v) => {
      spec.navmesh = v;
      meshStatus.hidden=!v;
      spec.onNavmesh(v);
    });
    navmesh.querySelector("input")!.disabled = spec.remote;
    navmesh.title = "Local debug view of the ground routing mesh for the default unit size. Bridge decks and other body sizes are not shown. Paths show actual movement, including local grid fallbacks.";
    hint.textContent = spec.remote
      ? "Network matches use synchronized speed and player vision."
      : "AI vision is unchanged. Uncheck Reveal map to use the selected perspective.";
    hint.style.cssText = "max-width:340px;color:#9ab0ab;line-height:1.4";
    const details=toggle(' Detailed simulation timings',this.detailedSimulation,value=>{this.detailedSimulation=value;});
    details.querySelector('input')!.dataset.simulationDetails='';
    details.title='Adds hierarchical instrumentation. Disable for budget measurements.';
    box.append(reveal, speed, vision, paths, walkability, navmesh, meshStatus, details, hint);
    this.text?.before(box);
    this.visibility();
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
  private captureButton:HTMLButtonElement|null=null;
  private graph:HTMLCanvasElement|null=null;
  private traceEvents:TraceEvent[]=[];
  private traceDropped=0;
  private traceReady=false;
  private traceButton:HTMLButtonElement|null=null;
  private trace(event:TraceEvent){if(this.traceEvents.length<MAX_TRACE_EVENTS)this.traceEvents.push(event);else this.traceDropped++;}
  traceReport(){return {traceEvents:[...this.traceEvents],displayTimeUnit:'ms',otherData:{droppedEvents:this.traceDropped,note:'CPU scopes are measured spans and may nest. Counters are sampled results at delivery time, not execution spans; GPU results arrive asynchronously.'}};}
  private downloadTrace(){
    if(!this.traceReady)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(this.traceReport())],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='under-the-canopy-performance-trace.json';a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  setBaseline(){this.baseline=this.captureResult??this.report();}
  capture(options:{quiet?:boolean;trace?:boolean}={}){this.captureOptions={quiet:options.quiet??false,trace:options.trace??true,simulationDetails:this.detailedSimulation};if(this.traceButton)this.traceButton.disabled=true;this.traceEvents=[];this.traceDropped=0;this.traceReady=false;this.recording=new Map();this.captureStart=performance.now();this.captureEnd=this.captureStart+10000;this.spikes=[];this.captureResult=null;this.visibility();}
  private snapshot(rows:Map<string,TimingWindow>){return Object.fromEntries([...rows].map(([k,v])=>[k,v.stats()]));}
  private drawGraph(){
    const g=this.graph?.getContext('2d');if(!g||!this.graph)return;
    const w=this.graph.width,h=this.graph.height;g.clearRect(0,0,w,h);g.fillStyle='#101315';g.fillRect(0,0,w,h);
    for(const ms of [8.33,16.67,33.33]){g.strokeStyle='#45484c';g.beginPath();g.moveTo(0,h-ms/50*h);g.lineTo(w,h-ms/50*h);g.stroke();}
    const frames=this.rows.get('Frame interval')?.values()??[];
    for(let i=0;i<frames.length;i++){const v=frames[i]!;g.fillStyle=v>16.67?'#f87171':v>FRAME_BUDGET_MS?'#fbbf24':'#a1a1aa';g.fillRect(i*w/120,h-Math.min(50,v)/50*h,Math.max(1,w/120-1),Math.min(50,v)/50*h);}
  }
  private values: Record<string, string | number> = {};
  private panel: HTMLDivElement | null = null;
  private presentationToggle:(()=>void)|undefined;
  /** Editors can present the same sampler/report through their own chrome.
   * Sampling controls and MCP remain independent from opening/closing that UI. */
  bindPresentation(toggle:()=>void):()=>void {
    this.presentationToggle=toggle;const hidden=this.panel?.hidden??false;
    if(this.panel)this.panel.hidden=true;
    return ()=>{if(this.presentationToggle!==toggle)return;this.presentationToggle=undefined;if(this.panel)this.panel.hidden=hidden;};
  }
  private text: HTMLPreElement | null = null;
  private navigationStatus:HTMLElement|null=null;
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
  private last = 0;
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
    const root = document.createElement("div");
    this.panel = root;
    root.className = "performance-debug";
    root.style.cssText =
      "position:fixed;right:12px;top:48px;max-width:calc(100vw - 24px);max-height:calc(100vh - 60px);overflow:auto;z-index:10000;color:#dce8e9;font:12px/1.5 monospace;pointer-events:auto";
    const toggle = document.createElement("button");
    toggle.className = "performance-debug-toggle";
    toggle.textContent = "Debug";
    toggle.onclick = () => this.toggle();
    toggle.style.cssText =
      "padding:5px 9px;color:#dce8e9;background:#182628;border:1px solid #53676b;cursor:pointer";
    const copy = document.createElement("button");
    copy.textContent = "Copy report";
    copy.style.cssText = toggle.style.cssText;
    copy.onclick = () => {
      void navigator.clipboard
        .writeText(JSON.stringify(this.captureResult??this.report(), null, 2))
        .then(
          () => {
            copy.textContent = "Copied";
          },
          () => {
            copy.textContent = "Copy unavailable";
          },
        );
    };
    this.text = document.createElement("pre");
    this.text.style.cssText =
      "background:#10191aee;border:1px solid #53676b;padding:12px;margin:5px 0;max-height:35vh;overflow:auto;min-width:0;white-space:pre;box-sizing:border-box;width:100%";
    const capture=this.captureButton=document.createElement('button');capture.textContent='Capture 10 seconds';capture.style.cssText=toggle.style.cssText;capture.onclick=()=>{if(!this.enabled)this.toggle();this.capture();};
    const baseline=document.createElement('button');baseline.textContent='Set baseline';baseline.style.cssText=toggle.style.cssText;baseline.onclick=()=>{this.setBaseline();baseline.textContent='Baseline saved';};
    this.graph=document.createElement('canvas');this.graph.width=360;this.graph.height=70;this.graph.setAttribute('aria-label','Last 120 frame intervals; lines at 8, 17 and 33 milliseconds');this.graph.style.cssText='display:block;width:360px;height:70px;margin-top:5px';
    const trace=this.traceButton=document.createElement('button');trace.textContent='Download trace';trace.style.cssText=toggle.style.cssText;trace.disabled=true;trace.title='Record a capture, then open the downloaded JSON in a trace viewer';trace.onclick=()=>this.downloadTrace();
    const census=document.createElement('button');census.textContent='Draw census';census.style.cssText=toggle.style.cssText;census.title='Attribute one frame of draw calls and triangles to scene branches (main and shadow pass)';census.onclick=()=>{this.censusPending=true;};
    for(const b of [copy,capture,baseline,trace,census])b.dataset.profiler='true';
    root.append(toggle, copy, capture, baseline, trace, census, this.graph, this.text);
    if (
      location.pathname.endsWith("reference-stage.html") &&
      !new URLSearchParams(location.search).has("debug")
    )
      root.hidden = true;
    if(this.presentationToggle)root.hidden=true;
    document.body.append(root);
    window.addEventListener("keydown", this.key);
    this.renderControls();
    this.visibility();
    Object.assign(window, { utcPerformance: this });
  }
  detach() {
    if (--this.refs > 0) return;
    this.panel?.remove();
    this.panel = null;
    this.text = null;
    this.controls = null;
    window.removeEventListener("keydown", this.key);
    this.rows.clear();
    this.recording=null;this.captureResult=null;this.baseline=null;this.latest={};this.spikes=[];this.graph=null;this.captureButton=null;this.traceEvents=[];this.traceReady=false;this.traceButton=null;
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
    this.visibility();
  }
  private visibility() {
    const details=this.panel?.querySelector<HTMLInputElement>('input[data-simulation-details]');
    if(details)details.checked=this.detailedSimulation;
    if(this.panel)this.panel.style.visibility=this.recording&&this.captureOptions.quiet?'hidden':'';
    if(this.panel)this.panel.style.width=this.enabled?'min(440px, calc(100vw - 24px))':'auto';
    if (this.controls)
      this.controls.style.display = this.enabled ? "grid" : "none";
    if (this.text) this.text.hidden = !this.enabled;
    if(this.graph)this.graph.style.display=this.enabled?'block':'none';
    this.panel?.querySelectorAll<HTMLButtonElement>('button[data-profiler]').forEach(button=>{button.hidden=!this.enabled;});
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
    if(name==='Navigation mesh'&&this.navigationStatus)this.navigationStatus.textContent=String(value);
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
    if(this.recording&&now>=this.captureEnd){this.captureResult=this.report();this.recording=null;this.traceReady=this.captureOptions.trace;this.visibility();}
    this.lastFrame = now;
    if(this.recording&&this.captureOptions.quiet)return;
    if(this.traceButton){this.traceButton.disabled=!this.traceReady;this.traceButton.title=this.traceReady?`${this.traceEvents.length} events · ${this.traceDropped} dropped`:'Record a capture first';}
    if(this.captureButton)this.captureButton.textContent=this.recording?`Capturing… ${Math.max(0,(this.captureEnd-now)/1000).toFixed(1)}s`:this.captureResult?'Capture complete · repeat':'Capture 10 seconds';
    if (now - this.last < 500 || !this.text || this.presentationToggle) return;
    this.last = now;
    this.drawGraph();
    const r = this.report();
    const frame = r.timings["Frame interval"];
    this.text.textContent =
      `PERFORMANCE  ${frame ? (1000 / frame.mean).toFixed(1) + " FPS" : ""}\n120 FPS budget: 8.33 ms · ${r.frameBudget.overBudgetPercent.toFixed(1)}% of presented intervals over budget\nMissed refreshes (>1.5× ${r.frameBudget.refreshMs.toFixed(2)} ms): ${r.frameBudget.missed} (${r.frameBudget.missedPercent.toFixed(1)}%)\nCPU scopes overlap • mean / p95 / p99 ms\n` +
      Object.entries(r.timings)
        .map(
          ([k, v]) =>
            `${k.padEnd(25)} ${v.mean.toFixed(2).padStart(7)} / ${v.p95!.toFixed(2)} / ${v.p99.toFixed(2)}`,
        )
        .join("\n") +
      (r.comparison?'\n\nBASELINE · mean change (negative is faster)\n'+Object.entries(r.comparison).filter(([k])=>['Frame interval','GPU frame','GPU atmosphere','App frame total (CPU)'].includes(k)).map(([k,v])=>`${k}: ${v.changePercent===null?'no baseline':(v.changePercent>0?'+':'')+v.changePercent.toFixed(1)+'%'}`).join('\n'):'') +
      "\n\n" +
      Object.entries(r.values)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
  }
}
export const perf = new PerformanceDebug();
