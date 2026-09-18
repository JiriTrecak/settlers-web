import type {ViewSnapshot} from '../../sim/world/world';
import type {EntityView,FogView,FogDeckNode} from '../../sim/game/observation';
import type {RuntimeFrame} from './runtime';

type Bytes={full:Uint8Array}|{changes:Uint32Array};
type FogPacket=Omit<FogView,'cells'|'floors'>&{cells:Bytes;floors?:{cells:Bytes;decks?:readonly FogDeckNode[]}};
type ViewPacket={size:number;tick:number;hasFog:boolean;meta:Omit<ViewSnapshot['settlement'],'entities'|'fog'>;entities:EntityView[];removed:number[];order?:number[];fog?:FogPacket};
export type FramePacket=Omit<RuntimeFrame,'visual'|'selection'>&{sequence:number;reset:boolean;sentAt:number;visual:ViewPacket;selection?:ViewPacket};

class ViewEncoder {
 private entities=new Map<number,EntityView>();
 private cells:Uint8Array|undefined;
 private floorCells:Uint8Array|undefined;
 private decks:readonly {cell:number;height:number}[]|undefined;
 private fogOwner:number|undefined;
 private fogRevision:number|undefined;
 encode(view:ViewSnapshot,transfer:ArrayBuffer[]):ViewPacket{
  const {entities,fog,...meta}=view.settlement,updates:EntityView[]=[],removed:number[]=[];
  const live=new Set<number>();let membership=false;
  for(const e of entities){live.add(e.id);if(this.entities.get(e.id)!==e)updates.push(e);if(!this.entities.has(e.id))membership=true;}
  for(const id of this.entities.keys())if(!live.has(id)){removed.push(id);membership=true;}
  this.entities=new Map(entities.map(e=>[e.id,e]));
  let fogPacket:FogPacket|undefined;
  if(fog&&(fog.owner!==this.fogOwner||fog.revision!==this.fogRevision)){
   const reset=fog.owner!==this.fogOwner;
   const bytes=(next:Uint8Array,old:Uint8Array|undefined):Bytes=>{
    if(reset||!old||old.length!==next.length){const full=next.slice();transfer.push(full.buffer);return {full};}
    const changed:number[]=[];for(let i=0;i<next.length;i++)if(next[i]!==old[i])changed.push(i*4+next[i]!);
    if(changed.length*4>=next.length){const full=next.slice();transfer.push(full.buffer);return {full};}
    const changes=new Uint32Array(changed);transfer.push(changes.buffer);return {changes};
   };
   fogPacket={owner:fog.owner,revision:fog.revision,cells:bytes(fog.cells,this.cells)};this.cells=fog.cells.slice();
   if(fog.floors){fogPacket.floors={cells:bytes(fog.floors.cells,this.floorCells),...(this.decks!==fog.floors.decks?{decks:fog.floors.decks}:{})};this.floorCells=fog.floors.cells.slice();this.decks=fog.floors.decks;}
   else {this.floorCells=undefined;this.decks=undefined;}
   this.fogOwner=fog.owner;this.fogRevision=fog.revision;
  }
  if(!fog){this.cells=undefined;this.floorCells=undefined;this.decks=undefined;this.fogOwner=undefined;this.fogRevision=undefined;}
  return {size:view.size,tick:view.tick,hasFog:!!fog,meta,entities:updates,removed,...(membership?{order:entities.map(e=>e.id)}:{}),...(fogPacket?{fog:fogPacket}:{})};
 }
}
class ViewDecoder {
 private entities=new Map<number,EntityView>();
 private order:number[]=[];
 private fog:FogView|undefined;
 decode(packet:ViewPacket):ViewSnapshot{
  for(const id of packet.removed)this.entities.delete(id);
  for(const e of packet.entities)this.entities.set(e.id,e);
  if(packet.order)this.order=packet.order;
  if(!packet.hasFog)this.fog=undefined;
  if(packet.fog){
   const bytes=(patch:Bytes,old?:Uint8Array)=>{
    if('full' in patch)return patch.full;
    if(!old)throw Error('Fog delta without baseline');
    for(const packed of patch.changes)old[Math.floor(packed/4)]=packed%4;return old;
   };
   const f=packet.fog;
   this.fog={owner:f.owner,revision:f.revision,cells:bytes(f.cells,this.fog?.cells),
    ...(f.floors?{floors:{cells:bytes(f.floors.cells,this.fog?.floors?.cells),decks:f.floors.decks??this.fog?.floors?.decks??[]}}:{})};
  }
  return {tick:packet.tick,size:packet.size,settlement:{...packet.meta,entities:this.order.map(id=>this.entities.get(id)!),...(this.fog?{fog:this.fog}:{})}};
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
