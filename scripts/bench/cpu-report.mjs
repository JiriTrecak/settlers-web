/** Summarize --cpu-profile samples using the exact retained bundle source map.
 * Usage: node scripts/bench/cpu-report.mjs /tmp/match.cpuprofile [--limit 30]
 * Sampling includes benchmark/inspector overhead; it is not budget acceptance.
 */
import {readFileSync} from 'node:fs';
import {SourceMap} from 'node:module';

const [file,...args]=process.argv.slice(2);
if(!file)throw Error('Provide the CPU profile JSON path');
const option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const limit=Number(option('--limit','30'));
if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw Error('--limit must be between 1 and 1000');
const profile=JSON.parse(readFileSync(file,'utf8'));
const map=new SourceMap(JSON.parse(readFileSync(option('--source-map',file+'.bundle.mjs.map'),'utf8')));
const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map(),sites=new Map(),locations=new Map();
for(const node of nodes.values()){
 for(const child of node.children??[])parents.set(child,node.id);
 const frame=node.callFrame;
 const mapped=frame.url?.endsWith('/match-budget.mjs')?map.findEntry(frame.lineNumber,frame.columnNumber):undefined;
 const source=mapped?.originalSource?.replace(/^.*\/(?=(?:src|scripts|tooling)\/)/,'')??frame.url??'';
 const site={source:source||'(engine)',line:(mapped?.originalLine??frame.lineNumber)+1,function:frame.functionName||'(anonymous)'};
 const key=JSON.stringify(site);locations.set(node.id,key);
 if(!sites.has(key))sites.set(key,{...site,selfMs:0,inclusiveMs:0,samples:0});
}
if(profile.samples?.length!==profile.timeDeltas?.length)throw Error('CPU samples and time deltas must match');
let sampledMs=0;
for(let i=0;i<profile.samples.length;i++){
 let id=profile.samples[i];const ms=profile.timeDeltas[i]/1000;
 if(!nodes.has(id)||!Number.isFinite(ms)||ms<0)throw Error('Invalid CPU sample');
 sampledMs+=ms;
 const site=sites.get(locations.get(id));site.selfMs+=ms;site.samples++;
 // Merge the same function/location across different callers, but count a
 // recursive location only once per sample. Parent/child inclusive rows overlap.
 const seen=new Set();
 while(id!==undefined){
  const key=locations.get(id);if(!key)throw Error('Missing CPU parent node');
  if(!seen.has(key)){seen.add(key);sites.get(key).inclusiveMs+=ms;}
  id=parents.get(id);
 }
}
const rank=metric=>[...sites.values()].filter(row=>row[metric]>0).sort((a,b)=>b[metric]-a[metric]).slice(0,limit)
 .map(row=>({...row,sharePercent:sampledMs?row[metric]/sampledMs*100:0}));
console.log(JSON.stringify({profile:file,
 scope:'Sampled elapsed time, including benchmark and inspector overhead. Self rows partition samples; inclusive rows overlap and must not be summed. Diagnostic only, not p99 acceptance.',
 sampledMs,samples:profile.samples.length,self:rank('selfMs'),inclusive:rank('inclusiveMs'),
},null,2));
