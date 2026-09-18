import {TimingWindow} from './timingWindow';
import {shortcuts,inputCaptured} from '../shared/input/shortcuts';
type TraceEvent={name:string;cat:string;ph:'X'|'C';pid:number;tid:number;ts:number;dur?:number;args?:Record<string,number>};
const MAX_TRACE_EVENTS=64000;
const FRAME_BUDGET_MS=1000/120;
type PerformanceReport={frameBudget:{targetMs:number;samples:number;overBudget:number;overBudgetPercent:number};note:string;values:Record<string,string|number>;timings:Record<string,ReturnType<TimingWindow['stats']>>;capturedMs?:number;spikes:Array<{atMs:number;frameMs:number;scopes:Record<string,number>}>;comparison?:Record<string,{baselineMean:number|undefined;currentMean:number;changePercent:number|null}>};
export type MatchDebugControls = {
  reveal: boolean;
  speed: number;
  remote: boolean;
  visionPlayer: number;
  players: readonly { player: number; name?: string }[];
  onReveal(value: boolean): void;
  onSpeed(value: number): void;
  onVision(player: number): void;
};
/** Opt-in profiler. CPU scopes overlap; GPU samples arrive asynchronously. */
export class PerformanceDebug {
  enabled = false;
  private matchControls: MatchDebugControls | null = null;
  private controls: HTMLElement | null = null;
  bindMatch(controls: MatchDebugControls): () => void {
    this.matchControls = controls;
    this.renderControls();
    return () => {
      if (this.matchControls === controls) {
        this.matchControls = null;
        this.controls?.remove();
        this.controls = null;
      }
    };
  }
  private renderControls() {
    this.controls?.remove();
    this.controls = null;
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
    const hint = document.createElement("small");
    hint.textContent = spec.remote
      ? "Network matches use synchronized speed and player vision."
      : "AI vision is unchanged. Uncheck Reveal map to use the selected perspective.";
    hint.style.cssText = "max-width:340px;color:#9ab0ab;line-height:1.4";
    box.append(reveal, speed, vision, hint);
    this.text?.before(box);
    this.visibility();
  }

  private rows = new Map<string, TimingWindow>();
  private recording:Map<string,TimingWindow>|null=null;
  private captureStart=0;private captureEnd=0;
  private captureResult:PerformanceReport|null=null;
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
  capture(){if(this.traceButton)this.traceButton.disabled=true;this.traceEvents=[];this.traceDropped=0;this.traceReady=false;this.recording=new Map();this.captureStart=performance.now();this.captureEnd=this.captureStart+10000;this.spikes=[];this.captureResult=null;}
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
  private text: HTMLPreElement | null = null;
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
      this.toggle();
    }
  };
  attach() {
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
      "position:fixed;right:12px;top:48px;z-index:10000;color:#dce8e9;font:12px/1.5 monospace;pointer-events:auto";
    const toggle = document.createElement("button");
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
      "background:#10191aee;border:1px solid #53676b;padding:12px;margin:5px 0;max-height:70vh;overflow:auto;min-width:350px;white-space:pre";
    const capture=this.captureButton=document.createElement('button');capture.textContent='Capture 10 seconds';capture.style.cssText=toggle.style.cssText;capture.onclick=()=>{if(!this.enabled)this.toggle();this.capture();};
    const baseline=document.createElement('button');baseline.textContent='Set baseline';baseline.style.cssText=toggle.style.cssText;baseline.onclick=()=>{this.setBaseline();baseline.textContent='Baseline saved';};
    this.graph=document.createElement('canvas');this.graph.width=360;this.graph.height=70;this.graph.setAttribute('aria-label','Last 120 frame intervals; lines at 8, 17 and 33 milliseconds');this.graph.style.cssText='display:block;width:360px;height:70px;margin-top:5px';
    const trace=this.traceButton=document.createElement('button');trace.textContent='Download trace';trace.style.cssText=toggle.style.cssText;trace.disabled=true;trace.title='Record a capture, then open the downloaded JSON in a trace viewer';trace.onclick=()=>this.downloadTrace();
    for(const b of [copy,capture,baseline,trace])b.dataset.profiler='true';
    root.append(toggle, copy, capture, baseline, trace, this.graph, this.text);
    if (
      location.pathname.endsWith("reference-stage.html") &&
      !new URLSearchParams(location.search).has("debug")
    )
      root.hidden = true;
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
    if (this.controls)
      this.controls.style.display = this.enabled ? "grid" : "none";
    if (this.text) this.text.hidden = !this.enabled;
    if(this.graph)this.graph.style.display=this.enabled?'block':'none';
    this.panel?.querySelectorAll<HTMLButtonElement>('button[data-profiler]').forEach(button=>{button.hidden=!this.enabled;});
  }
  start() {
    return this.enabled ? performance.now() : 0;
  }
  end(name: string, start: number) {
    if (!this.enabled || !start)return;
    const now=performance.now();this.sample(name,now-start);
    if(this.recording){const from=Math.max(start,this.captureStart);this.trace({name,cat:'CPU',ph:'X',pid:1,tid:1,ts:(from-this.captureStart)*1000,dur:Math.max(0,now-from)*1000});}
  }
  sample(name: string, ms: number) {
    if (!this.enabled) return;
    if(!Number.isFinite(ms)||ms<0)return;
    let a=this.rows.get(name);if(!a){a=new TimingWindow();this.rows.set(name,a);}a.add(ms);this.latest[name]=ms;
    if(this.recording&&(name.startsWith('GPU ')||name.startsWith('Sim · ')||name.startsWith('AI decision · ')||name==='Frame interval'))
      this.trace({name,cat:name.startsWith('GPU ')?'GPU result':'Sampled timing',ph:'C',pid:1,tid:2,ts:(performance.now()-this.captureStart)*1000,args:{milliseconds:ms}});
    if(this.recording){let r=this.recording.get(name);if(!r){r=new TimingWindow(4096);this.recording.set(name,r);}r.add(ms);}
  }

  value(name: string, value: string | number) {
    if (this.enabled) this.values[name] = value;
  }
  report():PerformanceReport {
    const frames=(this.recording??this.rows).get('Frame interval')?.values()??[];
    const overBudget=frames.filter(ms=>ms>FRAME_BUDGET_MS).length;
    return {
      frameBudget:{targetMs:FRAME_BUDGET_MS,samples:frames.length,overBudget,overBudgetPercent:frames.length?100*overBudget/frames.length:0},
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
    if(this.recording&&now>=this.captureEnd){this.captureResult=this.report();this.recording=null;this.traceReady=true;}
    if(this.traceButton){this.traceButton.disabled=!this.traceReady;this.traceButton.title=this.traceReady?`${this.traceEvents.length} events · ${this.traceDropped} dropped`:'Record a capture first';}
    if(this.captureButton)this.captureButton.textContent=this.recording?`Capturing… ${Math.max(0,(this.captureEnd-now)/1000).toFixed(1)}s`:this.captureResult?'Capture complete · repeat':'Capture 10 seconds';
    this.lastFrame = now;
    if (now - this.last < 500 || !this.text) return;
    this.last = now;
    this.drawGraph();
    const r = this.report();
    const frame = r.timings["Frame interval"];
    this.text.textContent =
      `PERFORMANCE  ${frame ? (1000 / frame.mean).toFixed(1) + " FPS" : ""}\n120 FPS budget: 8.33 ms · ${r.frameBudget.overBudgetPercent.toFixed(1)}% of presented intervals over budget\nCPU scopes overlap • mean / p95 / p99 ms\n` +
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
