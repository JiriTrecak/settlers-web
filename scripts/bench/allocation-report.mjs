/** Summarize --allocation-profile output using the exact retained bundle map.
 * These are sampling estimates of allocations (including collected objects),
 * not live heap size, object counts, or timing/budget acceptance evidence.
 * Usage: node scripts/bench/allocation-report.mjs /tmp/allocations.json
 *        [--source-map /tmp/match-budget.mjs.map] [--limit 25]
 */
import {readFileSync} from 'node:fs';
import {SourceMap} from 'node:module';

const [file,...args]=process.argv.slice(2);
if(!file)throw Error('Provide the allocation profile JSON path');
const option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const limit=Number(option('--limit','25'));
if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw Error('--limit must be between 1 and 1000');
const profile=JSON.parse(readFileSync(file,'utf8'));
const map=new SourceMap(JSON.parse(readFileSync(option('--source-map',file+'.bundle.mjs.map'),'utf8')));
const sites=new Map(),stacks=[];
let total=0;
function location(frame){
 const mapped=frame.url?.endsWith('/match-budget.mjs')?map.findEntry(frame.lineNumber,frame.columnNumber):undefined;
 const source=mapped?.originalSource?.replace(/^.*\/(?=(?:src|scripts|tooling)\/)/,'')??frame.url??'';
 return {source:source||'(engine)',line:(mapped?.originalLine??frame.lineNumber)+1,function:frame.functionName||'(anonymous)'};
}
function walk(node,parents){
 const site=location(node.callFrame),bytes=node.selfSize;
 total+=bytes;
 if(bytes){
  const key=JSON.stringify(site),old=sites.get(key);
  if(old)old.estimatedBytes+=bytes;else sites.set(key,{...site,estimatedBytes:bytes});
  stacks.push({estimatedBytes:bytes,site,callers:parents.slice(-6)});
 }
 for(const child of node.children??[])walk(child,[...parents,site]);
}
walk(profile.head,[]);
const ranked=rows=>rows.sort((a,b)=>b.estimatedBytes-a.estimatedBytes).slice(0,limit)
 .map(row=>({...row,estimatedMiB:row.estimatedBytes/1048576,sharePercent:total?row.estimatedBytes/total*100:0}));
console.log(JSON.stringify({
 profile:file,
 scope:'Sampled allocations including collected objects, after warm-up. Includes benchmark bookkeeping. Self bytes only; parent/child inclusive totals are not added.',
 estimatedBytes:total,estimatedMiB:total/1048576,samples:profile.samples?.length,
 sites:ranked([...sites.values()]),stacks:ranked(stacks),
},null,2));
