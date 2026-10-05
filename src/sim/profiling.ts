export type SimulationTiming = {path:string;inclusiveMs:number;selfMs:number;calls:number};
export type SimulationWork = {path:string;value:number};
type Active = {row:SimulationTiming;started:number;children:number};
/** Diagnostic-only hierarchy. Never used to make simulation decisions or saved.
 * Self time excludes measured children; inclusive parent/child times must not
 * be added. Known idle scopes emit zero on subsequent ticks, not event averages.
 * Disabled scopes do not read the clock. Enable only for investigation and
 * compare with an unprofiled run to measure instrumentation overhead. */
export class SimulationProfiler {
 enabled=false;
 /** Optional diagnostic timestamps; observer must not mutate simulation state. */
 onSpan?: (path:string,start:number,end:number)=>void;
 private readonly rows=new Map<string,SimulationTiming>();
 private readonly stack:Active[]=[];
 private readonly work=new Map<string,number>();
 constructor(private readonly now:()=>number=()=>performance.now()){}
 reset(){
  if(this.stack.length)throw Error('Cannot reset an active simulation profile');
  for(const key of this.work.keys())this.work.set(key,0);
  for(const row of this.rows.values()){row.inclusiveMs=0;row.selfMs=0;row.calls=0;}
 }
 measure<T>(name:string,work:()=>T):T {
  if(!this.enabled)return work();
  const parent=this.stack.at(-1),path=parent?`${parent.row.path} / ${name}`:name;
  let row=this.rows.get(path);
  if(!row){if(this.rows.size>=512)return work();row={path,inclusiveMs:0,selfMs:0,calls:0};this.rows.set(path,row);}
  const active={row,started:this.now(),children:0};this.stack.push(active);
  try{return work();}finally{
   const ended=this.now(),elapsed=ended-active.started;this.stack.pop();
   row.inclusiveMs+=elapsed;row.selfMs+=Math.max(0,elapsed-active.children);row.calls++;
   if(parent)parent.children+=elapsed;
   this.onSpan?.(path,active.started,ended);
  }
 }
 wrap<A extends unknown[],R>(name:string,work:(...args:A)=>R):(...args:A)=>R {
  return (...args)=>this.enabled?this.measure(name,()=>work(...args)):work(...args);
 }
 /** Work units, not durations. Names must be bounded categories, never entity IDs. */
 count(name:string,value=1):void {
  if(!this.enabled)return;
  const parent=this.stack.at(-1),path=parent?`${parent.row.path} / ${name}`:name;
  if(this.work.size<2048||this.work.has(path))this.work.set(path,(this.work.get(path)??0)+value);
 }
 workSnapshot():SimulationWork[]{return [...this.work].map(([path,value])=>({path,value}));}
 snapshot():SimulationTiming[]{return [...this.rows.values()].map(row=>({...row}));}
}
