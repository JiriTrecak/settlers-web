import type {MapStamp} from '../shared/map/utcmap';

type Changes={removed:readonly MapStamp[];added:readonly MapStamp[];reordered:boolean};
type Composition={base:readonly MapStamp[];dynamic:readonly MapStamp[]};
type Publication={token:symbol;previous?:symbol;changes?:Changes;composition?:Composition};
const publications=new WeakMap<readonly MapStamp[],Publication>();
/** Optional presentation-only change hints for immutable game scenery. The old
 * array is deliberately NOT retained: keeping the latest publication must not
 * retain every previous forest. Mutable editor arrays use the full sync path. */
export function sceneryChanges(before:readonly MapStamp[]|null|undefined,after:readonly MapStamp[]):Changes|undefined{
 const previous=before&&publications.get(before),next=publications.get(after);
 return previous&&next?.previous===previous.token?next.changes:undefined;
}
/** Immutable component lists, when the publisher can guarantee their identity. */
export function sceneryParts(stamps:readonly MapStamp[]):Composition|undefined{return publications.get(stamps)?.composition;}
function publish(next:readonly MapStamp[],before?:readonly MapStamp[],changes?:Changes,composition?:Composition){
 publications.set(next,{token:Symbol(),previous:before?publications.get(before)?.token:undefined,changes,composition});
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
  const next=publish([...base,...dynamic],this.value,changes,{base,dynamic});
  this.base=base;this.dynamic=dynamic;this.value=next;return next;
 }
}

/** Keep filtered views and forward removal hints to downstream consumers.
 * Without a verified publication chain, always inspect the supplied values. */
export class SceneryFilter {
 private input?:readonly MapStamp[];
 private output:readonly MapStamp[]=[];
 private compositionBase?:readonly MapStamp[];
 private filteredBase:readonly MapStamp[]=[];
 constructor(private readonly accepts:(stamp:MapStamp)=>boolean){}
 select(stamps:readonly MapStamp[]):readonly MapStamp[]{
  if(stamps===this.input)return this.output;
  const changes=sceneryChanges(this.input,stamps);this.input=stamps;
  const composition=sceneryParts(stamps);
  const filteredChanges=changes?{removed:changes.removed.filter(this.accepts),added:changes.added.filter(this.accepts),reordered:changes.reordered}:undefined;
  if(filteredChanges&&!filteredChanges.reordered){
   const {removed,added}=filteredChanges;
   if(!removed.length&&!added.length)return this.output;
   if(!added.length){
    const ids=new Set(removed.map(s=>s.id));
    const prior=sceneryParts(this.output);
    if(composition&&prior&&this.compositionBase===composition.base){
     const dynamic=prior.dynamic.filter(s=>!ids.has(s.id));
     this.output=publish([...prior.base,...dynamic],this.output,filteredChanges,{base:prior.base,dynamic});
    }else this.output=publish(this.output.filter(s=>!ids.has(s.id)),this.output,filteredChanges);
    return this.output;
   }
  }
  if(composition){
   // Resource discovery/regrowth must not reclassify the static forest. The
   // publisher guarantees immutable parts; untracked editor arrays still scan.
   if(this.compositionBase!==composition.base){this.compositionBase=composition.base;this.filteredBase=composition.base.filter(this.accepts);}
   const dynamic=composition.dynamic.filter(this.accepts);
   this.output=publish([...this.filteredBase,...dynamic],this.output,filteredChanges,{base:this.filteredBase,dynamic});
   return this.output;
  }
  this.output=publish(stamps.filter(this.accepts),this.output,filteredChanges);return this.output;
 }
}
