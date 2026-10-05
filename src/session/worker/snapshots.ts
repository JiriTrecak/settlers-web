import type {ViewSnapshot} from '../../sim/world/world';
import type {EntityView,FogView,FogDeckNode} from '../../sim/game/observation';
import type {RuntimeFrame} from './runtime';
import {associateResourceScenery,resourceSceneryChanged} from '../../presentation/resourceSceneryRevision';
import {byteChangesBetween} from '../../shared/snapshots/byteChanges';
import {decodeBytePatch,type BytePatch} from '../../shared/snapshots/decodedBytes';

type EntityField=Exclude<keyof EntityView,'id'>;
type EntityPatch={id:number;set:Partial<Omit<EntityView,'id'>>;unset?:EntityField[]};
/** Entity projections contain schema-defined JSON values. Compare nested values
 * because fresh projections recreate command/status objects even while idle.
 * This does not serialize or hash simulation state. */
function sameValue(a:unknown,b:unknown):boolean {
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 if(Array.isArray(a)&&Array.isArray(b)){
  if(a.length!==b.length)return false;
  for(let i=0;i<a.length;i++)if(!sameValue(a[i],b[i]))return false;
  return true;
 }
 const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=Object.keys(left);
 if(keys.length!==Object.keys(right).length)return false;
 for(const key of keys)if(!Object.prototype.hasOwnProperty.call(right,key)||!sameValue(left[key],right[key]))return false;
 return true;
}
function changes(old:EntityView,next:EntityView):EntityPatch|null {
 const set:Partial<Omit<EntityView,'id'>>={},unset:EntityField[]=[];let changed=false;
 for(const key of Object.keys(next) as (keyof EntityView)[])if(key!=='id'&&(!Object.prototype.hasOwnProperty.call(old,key)||!sameValue(old[key],next[key]))){
  (set as Record<string,unknown>)[key]=next[key];changed=true;
 }
 for(const key of Object.keys(old) as (keyof EntityView)[])if(key!=='id'&&!Object.prototype.hasOwnProperty.call(next,key))unset.push(key);
 return changed||unset.length?{id:next.id,set,...(unset.length?{unset}:{})}:null;
}
type Bytes=BytePatch;
type FogPacket=Omit<FogView,'cells'|'floors'>&{cells:Bytes;floors?:{cells:Bytes;decks?:readonly FogDeckNode[]}};
type ViewPacket={size:number;tick:number;hasFog:boolean;meta:Omit<ViewSnapshot['settlement'],'entities'|'fog'>;entities:EntityView[];patches:EntityPatch[];removed:number[];order?:number[];fog?:FogPacket};
export type FramePacket=Omit<RuntimeFrame,'visual'|'selection'>&{sequence:number;reset:boolean;sentAt:number;visual:ViewPacket;selection?:ViewPacket};

class ViewEncoder {
 private entities=new Map<number,EntityView>();
 private cells:Uint8Array|undefined;
 private floorCells:Uint8Array|undefined;
 private cellSource:Uint8Array|undefined;
 private floorSource:Uint8Array|undefined;
 private decks:readonly {cell:number;height:number}[]|undefined;
 private fogOwner:number|undefined;
 private fogRevision:number|undefined;
 encode(view:ViewSnapshot,transfer:ArrayBuffer[]):ViewPacket{
  const {entities,fog,...meta}=view.settlement,updates:EntityView[]=[],patches:EntityPatch[]=[],removed:number[]=[];
  const live=new Set<number>();let membership=false;
  for(const e of entities){
   live.add(e.id);const old=this.entities.get(e.id);
   if(!old){updates.push(e);membership=true;}
   else if(old!==e){const patch=changes(old,e);if(patch)patches.push(patch);}
  }
  for(const id of this.entities.keys())if(!live.has(id)){removed.push(id);membership=true;}
  this.entities=new Map(entities.map(e=>[e.id,e]));
  let fogPacket:FogPacket|undefined;
  if(fog&&(fog.owner!==this.fogOwner||fog.revision!==this.fogRevision)){
   const reset=fog.owner!==this.fogOwner;
   const bytes=(next:Uint8Array,old:Uint8Array|undefined,source:Uint8Array|undefined):Bytes=>{
    if(reset||!old||old.length!==next.length){const full=next.slice();transfer.push(full.buffer);return {full};}
    const changed:number[]=[],receipts=byteChangesBetween(source,next);
    if(receipts){for(const indices of receipts)for(const i of indices)if(next[i]!==old[i])changed.push(i*4+next[i]!);}
    else for(let i=0;i<next.length;i++)if(next[i]!==old[i])changed.push(i*4+next[i]!);
    if(changed.length*4>=next.length){const full=next.slice();transfer.push(full.buffer);return {full};}
    const changes=new Uint32Array(changed);transfer.push(changes.buffer);return {changes};
   };
   fogPacket={owner:fog.owner,revision:fog.revision,cells:bytes(fog.cells,this.cells,this.cellSource)};this.cells=fog.cells.slice();this.cellSource=fog.cells;
   if(fog.floors){fogPacket.floors={cells:bytes(fog.floors.cells,this.floorCells,this.floorSource),...(this.decks!==fog.floors.decks?{decks:fog.floors.decks}:{})};this.floorCells=fog.floors.cells.slice();this.floorSource=fog.floors.cells;this.decks=fog.floors.decks;}
   else {this.floorCells=undefined;this.floorSource=undefined;this.decks=undefined;}
   this.fogOwner=fog.owner;this.fogRevision=fog.revision;
  }
  if(!fog){this.cells=undefined;this.floorCells=undefined;this.cellSource=undefined;this.floorSource=undefined;this.decks=undefined;this.fogOwner=undefined;this.fogRevision=undefined;}
  return {size:view.size,tick:view.tick,hasFog:!!fog,meta,entities:updates,patches,removed,...(membership?{order:entities.map(e=>e.id)}:{}),...(fogPacket?{fog:fogPacket}:{})};
 }
}
class ViewDecoder {
 private entities=new Map<number,EntityView>();
 private order:number[]=[];
 private fog:FogView|undefined;
 private resourceRevision:object={};
 private resourceOrder:number[]=[];
 decode(packet:ViewPacket):ViewSnapshot{
  let resourcesChanged=false;
  for(const id of packet.removed){resourcesChanged ||=!!this.entities.get(id)?.resource;this.entities.delete(id);}
  for(const e of packet.entities){resourcesChanged ||=resourceSceneryChanged(this.entities.get(e.id),e);this.entities.set(e.id,e);}
  for(const patch of packet.patches){
   const old=this.entities.get(patch.id);if(!old)throw Error('Entity delta without baseline');
   const next={...old,...patch.set};for(const key of patch.unset??[])delete (next as Record<string,unknown>)[key];
   resourcesChanged ||=resourceSceneryChanged(old,next);this.entities.set(patch.id,next);
  }
  if(packet.order)this.order=packet.order;
  if(!packet.hasFog)this.fog=undefined;
  if(packet.fog){
   const f=packet.fog;
   this.fog={owner:f.owner,revision:f.revision,cells:decodeBytePatch(f.cells,this.fog?.cells),
    ...(f.floors?{floors:{cells:decodeBytePatch(f.floors.cells,this.fog?.floors?.cells),decks:f.floors.decks??this.fog?.floors?.decks??[]}}:{})};
  }
  // Actor membership changes do not alter the forest. Compare resource order
  // while assembling the required entity list, without another state scan.
  const resourceOrder=packet.order||resourcesChanged?[] as number[]:undefined;
  const entities=this.order.map(id=>{
   const entity=this.entities.get(id)!;
   if(resourceOrder&&entity.resource){
    if(this.resourceOrder[resourceOrder.length]!==id)resourcesChanged=true;
    resourceOrder.push(id);
   }
   return entity;
  });
  if(resourceOrder){resourcesChanged ||=resourceOrder.length!==this.resourceOrder.length;this.resourceOrder=resourceOrder;}
  if(resourcesChanged)this.resourceRevision={};
  associateResourceScenery(entities,this.resourceRevision);
  return {tick:packet.tick,size:packet.size,settlement:{...packet.meta,entities,...(this.fog?{fog:this.fog}:{})}};
 }
}
/** One acknowledged delta stream. Do not drop packets: coalesce in the sender
 * before encoding, otherwise later deltas would reference an unseen baseline. */
export class SnapshotEncoder {
 private visual=new ViewEncoder();private selection=new ViewEncoder();private sequence=0;private fresh=true;
 reset(){this.visual=new ViewEncoder();this.selection=new ViewEncoder();this.fresh=true;}
 encode(frame:RuntimeFrame){
  const {visual,selection,...meta}=frame,transfer:ArrayBuffer[]=[];
  const packet:FramePacket={...meta,sequence:++this.sequence,reset:this.fresh,sentAt:performance.timeOrigin+performance.now(),visual:this.visual.encode(visual,transfer),...(selection.settlement!==visual.settlement?{selection:this.selection.encode(selection,transfer)}:{})};
  this.fresh=false;return {packet,transfer};
 }
}
export class SnapshotDecoder {
 private visual=new ViewDecoder();private selection=new ViewDecoder();private sequence=0;
 decode(packet:FramePacket):RuntimeFrame{
  if(packet.sequence!==this.sequence+1&&!packet.reset)throw Error('Missing simulation snapshot');
  if(packet.reset){this.visual=new ViewDecoder();this.selection=new ViewDecoder();}
  this.sequence=packet.sequence;
  const {visual,selection,sequence:_sequence,reset:_reset,sentAt:_sentAt,...meta}=packet;
  const decoded=this.visual.decode(visual);
  return {...meta,visual:decoded,selection:selection?this.selection.decode(selection):decoded};
 }
}
