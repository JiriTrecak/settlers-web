import type {MapStamp} from '../shared/map/utcmap';

type Changes={removed:readonly MapStamp[];added:readonly MapStamp[];reordered:boolean};
type Publication={token:symbol;previous?:symbol;changes?:Changes};
const publications=new WeakMap<readonly MapStamp[],Publication>();
/** Optional presentation-only change hints for immutable game scenery. The old
 * array is deliberately NOT retained: keeping the latest publication must not
 * retain every previous forest. Mutable editor arrays use the full sync path. */
export function sceneryChanges(before:readonly MapStamp[]|null|undefined,after:readonly MapStamp[]):Changes|undefined{
 const previous=before&&publications.get(before),next=publications.get(after);
 return previous&&next?.previous===previous.token?next.changes:undefined;
}
function publish(next:readonly MapStamp[],before?:readonly MapStamp[],changes?:Changes){
 publications.set(next,{token:Symbol(),previous:before?publications.get(before)?.token:undefined,changes});
 return next;
}

/** Compose immutable static scenery with an immutable observed resource list.
 * Diff only the changing list; the hundred-thousand-record base is untouched. */
export class SceneryComposition {
 private base?:readonly MapStamp[];
 private dynamic:readonly MapStamp[]=[];
 private value:readonly MapStamp[]=[];
 compose(base:readonly MapStamp[],dynamic:readonly MapStamp[]):readonly MapStamp[]{
  if(this.base===base&&this.dynamic===dynamic)return this.value;
  let changes:Changes|undefined;
  if(this.base===base){
   const old=new Map(this.dynamic.map(s=>[s.id,s])),next=new Map(dynamic.map(s=>[s.id,s]));
   const removed=this.dynamic.filter(s=>next.get(s.id)!==s),added=dynamic.filter(s=>old.get(s.id)!==s);
   const surviving=this.dynamic.filter(s=>next.has(s.id));
   let i=0,reordered=false;
   for(const s of dynamic)if(old.has(s.id)&&surviving[i++]?.id!==s.id)reordered=true;
   changes={removed,added,reordered};
  }
  const next=publish([...base,...dynamic],this.value,changes);
  this.base=base;this.dynamic=dynamic;this.value=next;return next;
 }
}

/** Keep filtered views and forward removal hints to downstream consumers.
 * Without a verified publication chain, always inspect the supplied values. */
export class SceneryFilter {
 private input?:readonly MapStamp[];
 private output:readonly MapStamp[]=[];
 constructor(private readonly accepts:(stamp:MapStamp)=>boolean){}
 select(stamps:readonly MapStamp[]):readonly MapStamp[]{
  if(stamps===this.input)return this.output;
  const changes=sceneryChanges(this.input,stamps);this.input=stamps;
  if(changes&&!changes.reordered){
   const removed=changes.removed.filter(this.accepts),added=changes.added.filter(this.accepts);
   if(!removed.length&&!added.length)return this.output;
   if(!added.length){
    const ids=new Set(removed.map(s=>s.id));
    this.output=publish(this.output.filter(s=>!ids.has(s.id)),this.output,{removed,added,reordered:false});
    return this.output;
   }
  }
  const filteredChanges=changes?{removed:changes.removed.filter(this.accepts),added:changes.added.filter(this.accepts),reordered:changes.reordered}:undefined;
  this.output=publish(stamps.filter(this.accepts),this.output,filteredChanges);return this.output;
 }
}
