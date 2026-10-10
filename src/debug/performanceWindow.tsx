import {useEffect,useRef,useState} from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import {createRoot,type Root} from 'react-dom/client';
import {Activity,Download,Play,RotateCcw} from 'lucide-react';
import {Button} from '../components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle,DialogTrigger} from '../components/ui/dialog';
import {perf} from './performance';
import type {PerformanceSource} from './performanceSource';
import {Checkbox} from '../components/ui/checkbox';
import {NativeSelect} from '../components/ui/native-select';
import {cn} from '../ui/cn';
import {shortcuts} from '../shared/input/shortcuts';

type Stage={name:string;durationMs:number};
const milliseconds=(value:number|undefined)=>value===undefined?'—':value.toFixed(2);
function download(value:unknown,name:string){
 const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function Graph({label,values,color='stroke-sky-400'}:{label:string;values:number[];color?:string}){
 const ceiling=Math.max(33.34,...values),w=400,h=90;
 const path=values.map((value,i)=>`${i?'L':'M'}${i*w/Math.max(1,values.length-1)},${h-Math.min(value,ceiling)/ceiling*h}`).join(' ');
 return <section className="rounded-lg border border-solid border-border bg-muted/30 p-3">
  <div className="mb-3 flex justify-between gap-3 text-xs"><span className="font-medium">{label}</span><span className="font-mono text-muted-foreground">{milliseconds(values.at(-1))} ms</span></div>
  <svg viewBox={`0 0 ${w} ${h}`} className="block h-24 w-full overflow-visible" role="img" aria-label={`${label}, last ${values.length} samples in milliseconds`}>
   {[8.33,16.67,33.33].map(ms=><g key={ms}><line x1="0" x2={w} y1={h-ms/ceiling*h} y2={h-ms/ceiling*h} className="stroke-border" strokeDasharray="3 4"/><text x="3" y={h-ms/ceiling*h-3} fontSize="8" className="fill-muted-foreground">{ms.toFixed(1)}</text></g>)}
   <path d={path} className={cn('fill-none',color)} strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
  </svg>
  {!values.length&&<p className="m-0 mt-2 text-xs text-muted-foreground">Waiting for samples…</p>}
 </section>;
}
function Stages({title,total,stages}:{title:string;total?:number;stages?:Stage[]}){
 const max=Math.max(1,...(stages??[]).map(s=>s.durationMs));
 return <section className="min-w-0 rounded-lg border border-solid border-border p-4">
  <div className="mb-4 flex justify-between gap-3"><h3 className="m-0 text-sm font-semibold">{title}</h3><span className="font-mono text-sm">{milliseconds(total)} ms</span></div>
  {!stages?.length&&<p className="text-sm text-muted-foreground">No build has been measured.</p>}
  <div className="space-y-3">{stages?.filter(s=>s.durationMs>=.05).sort((a,b)=>b.durationMs-a.durationMs).map((s,i)=><div key={s.name+i}>
   <div className="mb-1 flex items-baseline justify-between gap-3 text-xs"><span className="truncate" title={s.name}>{s.name}</span><span className="shrink-0 font-mono text-muted-foreground">{milliseconds(s.durationMs)} ms</span></div>
   <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-sky-400/70" style={{width:`${100*s.durationMs/max}%`}}/></div>
  </div>)}</div>
 </section>;
}
function PerformanceWindow({source:editor}:{source:PerformanceSource}){
 const [open,setOpen]=useState(false),[tab,setTab]=useState('overview'),[report,setReport]=useState(()=>editor.performanceReport()),[useCapture,setUseCapture]=useState(false);
 const [benchmarking,setBenchmarking]=useState(false),[benchmarkError,setBenchmarkError]=useState(''),[quiet,setQuiet]=useState(perf.quietCapture);
 const benchmark=async()=>{setBenchmarking(true);setBenchmarkError('');try{await editor.performanceControl({action:'benchmark',width:1920,height:1080,frames:24});setReport(editor.performanceReport());}catch(error){setBenchmarkError(error instanceof Error?error.message:String(error));}finally{setBenchmarking(false);}};
 const initialEnabled=useRef(false), opened=useRef(false);
 const changeOpen=(value:boolean)=>{
  if(value===opened.current)return;
  opened.current=value;
  if(value){initialEnabled.current=perf.enabled;editor.performanceControl({action:'get',enabled:true});setReport(editor.performanceReport());}
  else if(!initialEnabled.current)editor.performanceControl({action:'get',enabled:false});
  setOpen(value);
 };
 const toggleRef=useRef(()=>{});toggleRef.current=()=>changeOpen(!open);
 useEffect(()=>{const unbind=perf.bindPresentation(()=>toggleRef.current());return()=>{unbind();if(opened.current&&!initialEnabled.current&&perf.enabled)perf.toggle();};},[]);
 useEffect(()=>{if(!open)return;const id=setInterval(()=>{setQuiet(perf.quietCapture);if(!perf.quietCapture)setReport(editor.performanceReport());},500);return ()=>clearInterval(id);},[open,editor]);
 const command=(action:'reset'|'capture'|'census')=>{editor.performanceControl({action});if(action!=='census')setUseCapture(false);setReport(editor.performanceReport());};
 const frames=useCapture&&report.capture?report.capture:report.frames,recording=report.frames.capturedMs!==undefined;
 const stages=Object.entries(frames.timings).sort((a,b)=>b[1].p95-a[1].p95);
 return <Dialog open={open&&!quiet&&!perf.quietCapture} onOpenChange={changeOpen}>
  <DialogTrigger render={<Button variant="outline" size="sm" className={cn("pointer-events-auto shadow-lg",perf.quietCapture&&"invisible")}/>} title="Performance · Ctrl+F3"><Activity className="size-4"/>Performance</DialogTrigger>
  <DialogContent className="editor-theme flex max-h-[90vh] max-w-[1080px] flex-col gap-4 overflow-hidden p-5 font-sans" onKeyDown={event=>{event.stopPropagation();if(!event.repeat&&shortcuts.matches('debug.toggle',event.nativeEvent)){event.preventDefault();changeOpen(false);}}}>
   <DialogHeader className="pr-10"><DialogTitle>Performance</DialogTitle><DialogDescription>{editor.title}{report.map&&` · ${report.map.name} · ${report.map.size} × ${report.map.size} · ${report.map.objects.toLocaleString()} generated objects`}</DialogDescription></DialogHeader>
   <div className="flex flex-wrap items-center gap-2">
    <Button size="sm" disabled={recording} onClick={()=>command('capture')}><Play className="size-3.5"/>{recording?`Recording ${Math.min(10,(report.frames.capturedMs??0)/1000).toFixed(1)} / 10 s`:'Capture 10 seconds'}</Button>
    <Button variant="outline" size="sm" onClick={()=>command('reset')} disabled={recording}><RotateCcw className="size-3.5"/>Reset timings</Button>
    {editor.benchmark&&<Button variant="outline" size="sm" disabled={benchmarking||recording} onClick={()=>void benchmark()}>{benchmarking?'Benchmarking…':'Benchmark 1080p'}</Button>}
    <Button variant="outline" size="sm" onClick={()=>download(report,'performance-report.json')}><Download className="size-3.5"/>Report</Button>
    <Button variant="ghost" size="sm" disabled={!report.capture?.sampling.trace||recording} onClick={()=>download(editor.performanceControl({action:'trace'}),'performance-trace.json')}>Download trace</Button>
    <div className="ml-auto flex rounded-md bg-muted p-1" aria-label="Timing source"><Button size="xs" variant={!useCapture?'secondary':'ghost'} aria-pressed={!useCapture} onClick={()=>setUseCapture(false)}>Live</Button><Button size="xs" variant={useCapture?'secondary':'ghost'} aria-pressed={useCapture} disabled={!report.capture} onClick={()=>setUseCapture(true)}>Last capture</Button></div>
   </div>
   {benchmarkError&&<p role="alert" className="m-0 text-sm text-destructive">{benchmarkError}</p>}
   <Tabs.Root value={tab} onValueChange={value=>setTab(value as typeof tab)} className="flex min-h-0 flex-col gap-4">
   <Tabs.List className="flex gap-1 border-0 border-b border-solid border-border pb-2" aria-label="Performance views">
    {[['overview','Frames'],...(editor.buildViews?[['opening','Opening'],['build','World build']]:[]),['draws','Draw calls'],['counters','Counters'],...(perf.match?[['match','Match']]:[])].map(([id,label])=><Tabs.Trigger key={id} value={id!} asChild><Button variant={tab===id?'secondary':'ghost'} size="sm">{label}</Button></Tabs.Trigger>)}
   </Tabs.List>
   <Tabs.Content value={tab} className="min-h-0 overflow-auto overscroll-contain pr-1 outline-none">
    {tab==='overview'&&<div className="space-y-4">
     {report.renderBenchmark&&<section className="space-y-3 rounded-lg border border-solid border-border p-4">
      <h3 className="m-0 text-sm font-semibold">World render benchmark · {report.renderBenchmark.width} × {report.renderBenchmark.height}</h3>
      <p className="m-0 text-xs text-muted-foreground">{report.renderBenchmark.completedFrames} / {report.renderBenchmark.frames} measured frames · CPU {milliseconds(report.renderBenchmark.cpu.mean)} ms mean · GPU {report.renderBenchmark.gpu?.samples?milliseconds(report.renderBenchmark.gpu.mean)+' ms mean':'unavailable'} · {report.renderBenchmark.rejectedGpuSamples} discarded GPU samples. Excludes UI, simulation and browser presentation; this is not interactive FPS.</p>
      <div className="grid gap-3 sm:grid-cols-2"><Graph label="Benchmark CPU" values={report.renderBenchmark.cpuSamples} color="stroke-emerald-400"/><Graph label="Benchmark GPU" values={report.renderBenchmark.gpuSamples} color="stroke-violet-400"/></div>
     </section>}

     <div className="grid gap-3 sm:grid-cols-3">{[['CPU frame',frames.timings['App frame total (CPU)']?.mean],['GPU frame',frames.timings['GPU frame']?.mean],['Presented interval',frames.timings['Frame interval']?.mean]].map(([name,value])=><div key={name} className="rounded-lg border border-solid border-border p-4"><div className="text-xs text-muted-foreground">{name}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{milliseconds(value as number|undefined)} <span className="text-xs font-normal text-muted-foreground">ms mean</span></div></div>)}</div>
     <div className="grid gap-3 sm:grid-cols-3"><Graph label="Frame interval" values={frames.series['Frame interval']??[]}/><Graph label="CPU frame" values={frames.series['App frame total (CPU)']??[]} color="stroke-emerald-400"/><Graph label="GPU frame" values={frames.series['GPU frame']??[]} color="stroke-violet-400"/></div>
     <p className="m-0 text-xs text-muted-foreground">{String(frames.values.Canvas??'Canvas pending')} · {frames.frameBudget.missed} missed refreshes ({frames.frameBudget.missedPercent.toFixed(1)}%) · median interval {frames.frameBudget.refreshMs.toFixed(2)} ms. CPU scopes overlap; GPU samples arrive asynchronously.</p>
     <div className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2 text-xs"><Checkbox checked={perf.detailedSimulation} disabled={recording} onCheckedChange={value=>{perf.detailedSimulation=value;setReport(editor.performanceReport());}}/>Detailed simulation timings (adds overhead)</label>
      <Button variant="outline" size="sm" disabled={recording} onClick={()=>{perf.setBaseline();setReport(editor.performanceReport());}}>Set baseline</Button>
      <Button variant="outline" size="sm" disabled={recording} onClick={()=>{perf.capture({quiet:true,trace:false});setReport(editor.performanceReport());}}>Quiet capture · 10 s</Button>
     </div>
     {frames.comparison&&<div className="grid gap-2 sm:grid-cols-3">{['Frame interval','App frame total (CPU)','GPU frame'].map(name=><div key={name} className="rounded-lg bg-muted p-3 text-xs">{name} · {frames.comparison?.[name]?.changePercent?.toFixed(1)??'—'}% vs baseline mean</div>)}</div>}
     <table className="w-full border-collapse text-left text-xs"><thead className="sticky top-0 bg-background text-muted-foreground"><tr><th className="px-2 py-2 font-medium">Measured work</th>{['Mean','p95','p99','Samples'].map(s=><th key={s} className="px-2 py-2 text-right font-medium">{s}</th>)}</tr></thead><tbody>{stages.map(([name,s])=><tr key={name} className="border-0 border-t border-solid border-border/50"><td className="px-2 py-2">{name}</td>{[milliseconds(s.mean),milliseconds(s.p95),milliseconds(s.p99),s.samples].map((v,i)=><td key={i} className="px-2 py-2 text-right font-mono">{v}</td>)}</tr>)}</tbody></table>
    </div>}
    {tab==='counters'&&<div className="space-y-2">{Object.entries(frames.values).map(([name,value])=><div key={name} className="grid grid-cols-2 gap-4 border-0 border-b border-solid border-border py-2 text-xs"><span>{name}</span><span className="break-words font-mono">{value}</span></div>)}</div>}
    {tab==='match'&&perf.match&&<MatchControls refresh={()=>setReport(editor.performanceReport())}/>}
    {tab==='build'&&<div className="space-y-4"><p className="mt-0 text-xs text-muted-foreground">Latest completed operation. Stages are sorted by duration. Compilation and presentation are separate measurements.</p><div className="grid items-start gap-4 md:grid-cols-2"><Stages title="Procedural generation" total={report.build?.totalMs} stages={report.build?.stages}/><Stages title="Editor updates" total={report.presentation?.totalMs} stages={report.presentation?.stages}/></div>
     </div>}
    {tab==='opening'&&<div className="space-y-4">{report.startup?<><p className="m-0 text-xs text-muted-foreground">{report.startup.map?.name??'Editor opening'} · {report.startup.status} · first scene submitted in {milliseconds(report.startup.firstFrameMs)} ms. Starts when the map is prepared; excludes page download. These are CPU submissions, not GPU completion. Asset waits overlap and must not be added together.</p><div className="grid items-start gap-4 md:grid-cols-2"><Stages title="Opening stages" total={report.startup.totalMs} stages={report.startup.stages}/><Stages title="Remaining asset waits" total={Math.max(0,...report.startup.waits.map(s=>s.durationMs))} stages={report.startup.waits}/></div></>:<p className="text-sm text-muted-foreground">No editor opening has been measured.</p>}
    </div>}
    {tab==='opening'&&report.sceneryConstruction&&<div className="space-y-4">
     <p className="m-0 text-xs text-muted-foreground">Latest scenery construction · {report.sceneryConstruction.placement?.count.toLocaleString()??'0'} placements. Model loading includes fetch, image decoding, parsing and scheduling; those waits overlap.</p>
     <Stages title="Scenery construction" stages={report.sceneryConstruction.placement?[
      {name:'Wait for model prototypes',durationMs:report.sceneryConstruction.placement.waitMs},
      {name:'Create and place instances',durationMs:report.sceneryConstruction.placement.placeMs},
      {name:'Build render batches',durationMs:report.sceneryConstruction.batchMs},
     ]:undefined}/>
     <details className="rounded-lg border border-solid border-border p-3"><summary className="cursor-pointer text-sm font-medium">Model loading · {report.sceneryConstruction.models.length} assets</summary>
      <table className="mt-3 w-full border-collapse text-left text-xs"><thead><tr>{['Asset','Load / parse','Preparation'].map(name=><th key={name} className="px-2 py-2 font-medium text-muted-foreground">{name}</th>)}</tr></thead><tbody>{report.sceneryConstruction.models.map(model=><tr key={model.asset+'#'+model.variant} className="border-0 border-t border-solid border-border/50"><td className="px-2 py-2">{model.asset}{model.variant?' · '+model.variant:''}</td><td className="px-2 py-2 font-mono">{milliseconds(model.fetchParseMs)} ms</td><td className="px-2 py-2 font-mono">{milliseconds(model.prepareMs)} ms</td></tr>)}</tbody></table>
     </details>
    </div>}
    {tab==='draws'&&<div className="space-y-4">
     <div className="flex items-center justify-between gap-4"><p className="m-0 text-xs text-muted-foreground">One frame, attributed to scene branches. Main and shadow passes are counted separately.</p><Button variant="outline" size="sm" onClick={()=>command('census')}>Inspect next frame</Button></div>
     <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{['Draw calls','Triangles (all passes)','Textures','Geometries'].map(name=><section key={name} className="rounded-lg border border-solid border-border p-3"><div className="text-xs text-muted-foreground">{name}</div><div className="mt-1 font-mono text-lg">{frames.values[name]??'—'}</div></section>)}</div>
     <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{['Scenery visible draws','Scenery shadow draws','Scenery visible upload bytes','Scenery shadow upload bytes'].map(name=><section key={name} className="rounded-lg border border-solid border-border bg-muted/20 p-3"><div className="text-xs text-muted-foreground">{name.replace(' bytes','')}</div><div className="mt-1 font-mono text-lg">{typeof frames.values[name]==='number'&&name.endsWith('bytes')?`${((frames.values[name] as number)/1024).toFixed(1)} KiB`:frames.values[name]??'—'}</div></section>)}</div>
     <p className="m-0 text-xs text-muted-foreground">{frames.values['Scenery draw groups']!==undefined&&`${frames.values['Scenery draw groups']} shared scenery groups. `}Uploads show changed instance transforms for each pass. An unchanged camera and scene should settle at zero.</p>
     {!report.frames.census?<p className="py-10 text-center text-sm text-muted-foreground">Inspect a frame to see which assets account for the most draws.</p>:<table className="w-full border-collapse text-left text-xs"><thead><tr>{['Scene branch','Main draws','Shadow draws','Triangles'].map(s=><th key={s} className="px-2 py-2 font-medium text-muted-foreground">{s}</th>)}</tr></thead><tbody>{[...report.frames.census.rows].sort((a,b)=>(b.mainDraws+b.shadowDraws)-(a.mainDraws+a.shadowDraws)).filter(r=>r.mainDraws+r.shadowDraws>0).map(r=><tr key={r.branch} className="border-0 border-t border-solid border-border/50"><td className="max-w-[480px] truncate px-2 py-2" title={r.branch}>{r.branch}</td><td className="px-2 py-2 font-mono">{r.mainDraws}</td><td className="px-2 py-2 font-mono">{r.shadowDraws}</td><td className="px-2 py-2 font-mono">{Math.round(r.mainTriangles+r.shadowTriangles).toLocaleString()}</td></tr>)}</tbody></table>}
    </div>}
   </Tabs.Content>
   </Tabs.Root>
  </DialogContent>
 </Dialog>;
}
function MatchControls({refresh}:{refresh:()=>void}){
 const spec=perf.match!;
 const toggles=[['Reveal map (visual only)','reveal','onReveal',spec.remote],['World grid','worldGrid','onWorldGrid',false],['Unit paths','paths','onPaths',false],['Walkable / blocked cells','walkability','onWalkability',false],['Ground navmesh','navmesh','onNavmesh',spec.remote]] as const;
 return <section aria-label="Match debug controls" className="space-y-5">
  <div className="grid gap-4 sm:grid-cols-2">{toggles.map(([label,key,callback,disabled])=><label key={key} className="flex items-center gap-3 rounded-lg border border-solid border-border p-3 text-sm"><Checkbox checked={spec[key]} disabled={disabled} onCheckedChange={value=>{spec[key]=value;spec[callback](value);refresh();}}/>{label}</label>)}</div>
  <div className="grid gap-4 sm:grid-cols-2">
   <label className="space-y-2 text-sm">Match speed<NativeSelect aria-label="Match speed" value={spec.speed} disabled={spec.remote} onChange={e=>{spec.speed=Number(e.target.value);spec.onSpeed(spec.speed);refresh();}}>{[1,2,3,4].map(n=><option key={n} value={n}>{n}×</option>)}</NativeSelect></label>
   <label className="space-y-2 text-sm">Fog perspective<NativeSelect aria-label="Fog perspective" value={spec.visionPlayer} disabled={spec.remote} onChange={e=>{spec.visionPlayer=Number(e.target.value);spec.onVision(spec.visionPlayer);refresh();}}>{spec.players.map(p=><option key={p.player} value={p.player}>Player {p.player+1}{p.name?` · ${p.name}`:''}</option>)}</NativeSelect></label>
  </div>
  <p className="text-xs text-muted-foreground">{spec.remote?'Network matches use synchronized speed and player vision.':'AI vision is unchanged. Uncheck Reveal map to use the selected perspective.'}</p>
  {spec.navmesh&&<p className="text-xs text-muted-foreground">{perf.report().values['Navigation mesh']??'Ground routing mesh for the default unit size; bridge decks use the surface solver.'}</p>}
 </section>;
}
export class PerformanceDebugWindow {
 private root:Root;
 private host:HTMLElement;
 constructor(host:HTMLElement,source:PerformanceSource,position='top-4'){this.host=document.createElement('div');this.host.className=cn('performance-debug editor-theme pointer-events-none fixed right-4 z-40 font-sans text-foreground',position);host.append(this.host);this.root=createRoot(this.host);this.root.render(<PerformanceWindow source={source}/>);}
 destroy(){this.root.unmount();this.host.remove();}
}
