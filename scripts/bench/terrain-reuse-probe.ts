import type {Spatial} from '../../src/sim/game/spatial';
import type {FixedPoint} from '../../src/sim/game/motion';

/** Shadow a bounded terrain-only cache while still executing every real query.
 * Diagnostic overhead is deliberately excluded from acceptance measurements. */
export function terrainReuseProbe(spatial:Spatial,tick:()=>number,mode:'long'|'short'='long'){
 const internal=spatial as unknown as {
  clearGroundSweep(from:FixedPoint,to:FixedPoint,step:(a:number,b:number)=>boolean,radius:number):boolean;
 };
 const original=internal.clearGroundSweep.bind(spatial),cache=new Map<string,boolean>();
 const route=spatial.route.bind(spatial);let requestKeys:Set<string>|undefined;
 spatial.route=(...args)=>{const previous=requestKeys;requestKeys=new Set();
  try{return route(...args);}finally{requestKeys=previous;}};
 let revision=spatial.revision;
 const ticks=new Map<number,{tick:number;queries:number;ms:number}>();
 const report={scope:'Shadow cache; all original queries still run. Diagnostic timings are not acceptance measurements.',mode,queries:0,hits:0,crossRequestHits:0,mismatches:0,totalMs:0,hitMs:0,crossRequestMs:0,invalidations:0,
  get worstReuseTicks(){return [...ticks.values()].sort((a,b)=>b.ms-a.ms).slice(0,12);}};
 internal.clearGroundSweep=(from,to,step,radius)=>{
  const long=Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y))>=16000;
  if(long!==(mode==='long'))return original(from,to,step,radius);
  if(revision!==spatial.revision){cache.clear();revision=spatial.revision;report.invalidations++;}
  const key=`${radius}/${from.x}/${from.y}/${to.x}/${to.y}`,old=cache.get(key);
  const withinRequest=requestKeys?.has(key)??false;requestKeys?.add(key);
  const started=performance.now(),result=original(from,to,step,radius),ms=performance.now()-started;
  report.queries++;report.totalMs+=ms;
  if(old!==undefined){report.hits++;report.hitMs+=ms;report.mismatches+=Number(old!==result);
   if(!withinRequest){report.crossRequestHits++;report.crossRequestMs+=ms;
    const at=tick(),row=ticks.get(at)??{tick:at,queries:0,ms:0};row.queries++;row.ms+=ms;ticks.set(at,row);}}
  else{if(cache.size>=1024)cache.delete(cache.keys().next().value!);cache.set(key,result);}
  return result;
 };
 return report;
}
