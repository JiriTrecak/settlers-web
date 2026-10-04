import {sceneryChanges,SceneryFilter} from '../../presentation/sceneryChanges';
import type {MapStamp} from '../../shared/map/utcmap';
import {sceneryKind} from './terrainStyle';

type Kind=NonNullable<ReturnType<typeof sceneryKind>>;
export type SceneryItem={stamp:MapStamp;kind:Kind};
/** Classification depends on the asset, not each of its thousands of instances.
 * Preserve source order before the stable Y sort, including overlapping ties. */
export class MinimapSceneryIndex {
 private previous?:readonly MapStamp[];
 private kinds=new Map<string,Kind|null>();
 private filter=new SceneryFilter(stamp=>this.kind(stamp.asset)!==null);
 private kind(asset:string):Kind|null{
  let kind=this.kinds.get(asset);
  if(kind===undefined){kind=sceneryKind(asset);this.kinds.set(asset,kind);}
  return kind;
 }
 private source:SceneryItem[]=[];
 private sorted:SceneryItem[]=[];
 private byId=new Map<string,SceneryItem>();
 get items():readonly SceneryItem[]{return this.sorted;}
 update(input:readonly MapStamp[]):boolean{
  const stamps=this.filter.select(input);
  if(stamps===this.previous)return false;
  const changes=sceneryChanges(this.previous,stamps);this.previous=stamps;
  if(changes&&!changes.reordered&&!changes.added.length){
   const removed=new Set(changes.removed.filter(s=>this.byId.has(s.id)).map(s=>s.id));
   if(!removed.size)return false;
   for(const id of removed)this.byId.delete(id);
   this.source=this.source.filter(item=>!removed.has(item.stamp.id));
   this.sorted=this.sorted.filter(item=>!removed.has(item.stamp.id));
   return true;
  }
  const source:SceneryItem[]=[];let changed=false;
  for(const stamp of stamps){
   const kind=this.kind(stamp.asset);
   if(kind===null)continue;
   // Harvesting removes a record in the middle of the list. Reuse the other
   // trees by identity instead of treating the whole shifted tail as new.
   const prior=this.byId.get(stamp.id);
   if(prior!==this.source[source.length])changed=true;
   if(prior&&prior.kind===kind&&sameAppearance(prior.stamp,stamp))source.push(prior);
   // Retain a value snapshot: a caller can submit a new array containing a
   // changed stamp object that was also present in the previous array.
   else{source.push({stamp:{...stamp},kind});changed=true;}
  }
  changed ||=source.length!==this.source.length;
  if(!changed)return false;
  this.source=source;
  this.byId=new Map(source.map(item=>[item.stamp.id,item]));
  const sorted=source.slice().sort((a,b)=>a.stamp.y-b.stamp.y);
  // Authored edits may move a record to the end of the document. Only the
  // resulting painter order matters: reordering different Y values changes
  // nothing, while overlapping equal-Y ties must still invalidate the raster.
  if(sorted.length===this.sorted.length&&sorted.every((item,i)=>item.kind===this.sorted[i]!.kind&&sameAppearance(item.stamp,this.sorted[i]!.stamp)))return false;
  this.sorted=sorted;return true;
 }
}
function sameAppearance(a:MapStamp,b:MapStamp):boolean{
 return a===b||(a.x===b.x&&a.y===b.y&&a.asset===b.asset&&a.variant===b.variant&&a.scale===b.scale&&a.widthScale===b.widthScale);
}
