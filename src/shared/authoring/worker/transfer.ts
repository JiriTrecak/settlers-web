/** One ordered compiler snapshot stream. Never detach buffers owned by compiler
 * caches. Receivers retain unchanged records/buffers and yield during large decodes.
 */
type Records={rows:Uint8Array[];raw:[number,{id:string}][];order?:Uint32Array;removed:Uint32Array};
type BufferRef={bufferId:number};
type Wire=unknown;
const utf8=new TextEncoder(),text=new TextDecoder();
function equalRecord(a:any,b:any):boolean{
 if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&equalRecord(a[key],b[key]));
}
/** Keep the common numeric/string records on JSON's native fast path. A replacer
 * invokes JavaScript for every scalar (millions on a large forest); scan first
 * and reserve structured clone for values JSON would alter. */
function requiresStructuredClone(value:unknown):boolean{
 if(value===null)return false;
 switch(typeof value){
  case 'string':case 'boolean':return false;
  case 'number':return !Number.isFinite(value)||Object.is(value,-0);
  case 'object':{
   if(Array.isArray(value)){for(let i=0;i<value.length;i++)if(requiresStructuredClone(value[i]))return true;return false;}
   if(Object.getPrototypeOf(value)!==Object.prototype)return true;
   for(const key of Object.keys(value))if(requiresStructuredClone((value as Record<string,unknown>)[key]))return true;
   return false;
  }
  default:return true;
 }
}
class RecordEncoder {
 private rows=new Map<string,{value:unknown;handle:number}>();private nextHandle=0;
 private order:string[]=[];
 private values:readonly {id:string}[]|undefined;
 restore(values:{id:string}[],packet:Records):void{
  const handles=packet.order??new Uint32Array();
  if(handles.length!==values.length||packet.removed.length||new Set(handles).size!==handles.length)throw Error('Invalid initial record handles');
  let order=values.map(v=>v.id);if(new Set(order).size!==order.length)order=values.map((_,i)=>String(i));
  for(let i=0;i<values.length;i++){
   const handle=handles[i]!;if(!handle)throw Error('Invalid initial record handle');
   this.rows.set(order[i]!,{value:values[i],handle});this.nextHandle=Math.max(this.nextHandle,handle);
  }
  this.order=order;this.values=values;
 }
 encode(values:{id:string}[],transfer:ArrayBuffer[]):Records{
  // Compiler snapshots are immutable; pose-only edits retain the entire generated
  // collection. Do not reindex a hundred thousand unchanged records in that case.
  if(values===this.values)return {rows:[],raw:[],removed:new Uint32Array()};
  // Pose edits replace a few immutable records without changing their order.
  // Retain handles and the ID index instead of rebuilding Maps/Sets for the
  // entire forest. The stored order also handles duplicate-ID positional keys.
  if(this.values&&values.length===this.values.length&&values.every((value,i)=>value.id===this.values![i]!.id)){
   const rows:[number,{id:string}][]=[],raw:Records['raw']=[];
   for(let i=0;i<values.length;i++){
    const value=values[i]!,key=this.order[i]!,old=this.rows.get(key)!;
    if(equalRecord(old.value,value))continue;
    if(requiresStructuredClone(value))raw.push([old.handle,value]);else rows.push([old.handle,value]);
    this.rows.set(key,{value,handle:old.handle});
   }
   this.values=values;
   return {rows:encodeChunks(rows,transfer),raw,removed:new Uint32Array()};
  }
  const rows:[number,{id:string}][]=[],raw:Records['raw']=[],next=new Map<string,{value:unknown;handle:number}>();
  // Legacy stamps and authored objects may share an ID. Preserve their ordered
  // records rather than silently collapsing them in an ID-keyed transport.
  let order=values.map(v=>v.id);if(new Set(order).size!==order.length)order=values.map((_,i)=>String(i));
  for(let i=0;i<values.length;i++){
   const value=values[i]!,key=order[i]!,old=this.rows.get(key);
   const handle=old?.handle??++this.nextHandle;
   if(!equalRecord(old?.value,value)){
    // JSON is the fast bulk path; preserve values JSON cannot represent exactly
    // through structured clone (including explicit undefined and signed zero).
    if(requiresStructuredClone(value))raw.push([handle,value]);
    else rows.push([handle,value]);
   }
   next.set(key,{value,handle});
  }
  const changed=order.length!==this.order.length||order.some((id,i)=>id!==this.order[i]);
  const gone:number[]=[];for(const [id,row] of this.rows)if(!next.has(id))gone.push(row.handle);
  const removed=new Uint32Array(gone);transfer.push(removed.buffer);
  this.order=order;this.rows=next;this.values=values;
  const handles=changed?Uint32Array.from(order,id=>next.get(id)!.handle):undefined;if(handles)transfer.push(handles.buffer);
  return {rows:encodeChunks(rows,transfer),raw,removed,...(handles?{order:handles}:{})};
 }
}
function encodeChunks(rows:[number,{id:string}][],transfer:ArrayBuffer[]):Uint8Array[]{
 const chunks:Uint8Array[]=[];
 for(let i=0;i<rows.length;i+=1024){const bytes=utf8.encode(JSON.stringify(rows.slice(i,i+1024)));chunks.push(bytes);transfer.push(bytes.buffer as ArrayBuffer);}
 return chunks;
}
class RecordDecoder {
 private rows=new Map<number,{id:string}>();private order:Uint32Array=new Uint32Array();
 private result:{id:string}[]=[];
 async decode(packet:Records,yieldTask:()=>Promise<void>){
  if(!packet.order&&!packet.raw.length&&!packet.rows.length&&!packet.removed.length)return this.result;
  for(const [id,value] of packet.raw)this.rows.set(id,value);
  for(const chunk of packet.rows){
   const updates=JSON.parse(text.decode(chunk)) as [number,{id:string}][];
   for(const [id,value] of updates)this.rows.set(id,value);
   await yieldTask();
  }
  for(const id of packet.removed)this.rows.delete(id);
  if(packet.order)this.order=packet.order;
  const result:{id:string}[]=[];
  for(let i=0;i<this.order.length;i++){
   const id=this.order[i]!,row=this.rows.get(id);if(!row)throw Error('Missing transferred object '+id);result.push(row);
   if(i%4096===4095)await yieldTask();
  }
  this.result=result;return result;
 }
}
export type Packet={sequence:number;meta:Wire;buffers:{id:number;values:Float32Array|Uint8Array}[];liveBuffers:number[];objects:Records;stamps:Records;resources:Records;owners:Records};
export class AuthoringTransferEncoder {
 private sequence=0;private nextBuffer=0;private ids=new WeakMap<Float32Array|Uint8Array,number>();private sent=new Set<number>();
 private objects=new RecordEncoder();private stamps=new RecordEncoder();private owners=new RecordEncoder();private resources=new RecordEncoder();
 private ownerRecords=new Map<string,{id:string;owner:string}>();
 private ownerValues:{id:string;owner:string}[]=[];
 private sourceOwners:Map<string,string>|undefined;
 /** Bootstrap a fresh delta stream from an already decoded, complete cache
  * packet. Reuse its encoded rows instead of scanning/stringifying them again.
  * Only transport buffers are detached; compiler-owned Float32 arrays are copied. */
 restore(value:any,packet:Packet){
  if(this.sequence!==0||packet.sequence!==1)throw Error('Expected a fresh snapshot stream');
  this.objects.restore(value.generated?.objects??[],packet.objects);
  this.stamps.restore(value.stamps,packet.stamps);this.resources.restore(value.resources,packet.resources);
  this.sourceOwners=value.owners;
  this.ownerValues=Array.from(value.owners as Map<string,string>,([id,owner])=>({id,owner}));
  this.ownerRecords=new Map(this.ownerValues.map(row=>[row.id,row]));
  this.owners.restore(this.ownerValues,packet.owners);
  const transfer:ArrayBuffer[]=[],buffers:Packet['buffers']=[];
  const live=new Set(packet.liveBuffers);
  if(live.size!==packet.buffers.length)throw Error('Incomplete cached terrain buffers');
  for(const {id,values} of packet.buffers){
   if(!Number.isSafeInteger(id)||id<=0||!live.delete(id)||!(values instanceof Float32Array||values instanceof Uint8Array))throw Error('Invalid cached terrain buffer');
   this.ids.set(values,id);this.sent.add(id);this.nextBuffer=Math.max(this.nextBuffer,id);
   const copy=values.slice();buffers.push({id,values:copy});transfer.push(copy.buffer);
  }
  for(const records of [packet.objects,packet.stamps,packet.resources,packet.owners]){
   for(const chunk of records.rows)transfer.push(chunk.buffer as ArrayBuffer);
   if(records.order)transfer.push(records.order.buffer as ArrayBuffer);
   transfer.push(records.removed.buffer as ArrayBuffer);
  }
  this.sequence=1;
  return {packet:{...packet,buffers},transfer:[...new Set(transfer)]};
 }
 encode(value:any){
  const transfer:ArrayBuffer[]=[],buffers:Packet['buffers']=[],live=new Set<number>();
  const visit=(item:any):any=>{
   if(item instanceof Float32Array||item instanceof Uint8Array){
    let id=this.ids.get(item);if(id===undefined){id=++this.nextBuffer;this.ids.set(item,id);}live.add(id);
    if(!this.sent.has(id)){const values=item.slice();buffers.push({id,values});transfer.push(values.buffer);this.sent.add(id);}
    return {bufferId:id} satisfies BufferRef;
   }
   if(Array.isArray(item))return item.map(visit);
   if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).map(([key,v])=>[key,visit(v)]));
   return item;
  };
  const {generated,stamps,resources,owners,...rest}=value;
  const {objects=[],...generation}=generated??{};
  const meta=visit({...rest,...(generated?{generated:generation}:{})});
  // Buffers no longer in the snapshot must be sent again if undo resurrects them.
  this.sent=live;
  // Ownership often arrives as a fresh Map after a pose edit even though every
  // entry is identical. Retain the ordered collection so its encoder can skip
  // another full ID index/delta pass over the forest.
  if(owners!==this.sourceOwners){
   const next:{id:string;owner:string}[]=[];let changed=owners.size!==this.ownerValues.length;
   for(const [id,owner] of owners as Map<string,string>){
    const old=this.ownerRecords.get(id),row=old?.owner===owner?old:{id,owner};
    if(row!==this.ownerValues[next.length])changed=true;next.push(row);
   }
   if(changed){this.ownerValues=next;this.ownerRecords=new Map(next.map(row=>[row.id,row]));}
   this.sourceOwners=owners;
  }
  const ownerRecords=this.ownerValues;
  const packet:Packet={sequence:++this.sequence,meta,buffers,liveBuffers:[...live],objects:this.objects.encode(objects,transfer),stamps:this.stamps.encode(stamps,transfer),resources:this.resources.encode(resources,transfer),owners:this.owners.encode(ownerRecords,transfer)};
  return {packet,transfer};
 }
}
export class AuthoringTransferDecoder {
 private sequence=0;private buffers=new Map<number,Float32Array|Uint8Array>();private objects=new RecordDecoder();private stamps=new RecordDecoder();private owners=new RecordDecoder();private resources=new RecordDecoder();
 private ownerRows:readonly {id:string}[]|undefined;private ownerMap=new Map<string,string>();
 async decode(packet:Packet,yieldTask:()=>Promise<void>):Promise<any>{
  if(packet.sequence!==this.sequence+1)throw Error('Out-of-order authoring snapshot');this.sequence=packet.sequence;
  const live=new Set(packet.liveBuffers);for(const id of this.buffers.keys())if(!live.has(id))this.buffers.delete(id);
  for(const {id,values} of packet.buffers)this.buffers.set(id,values);
  const visit=(item:any):any=>{
   if(item&&typeof item==='object'&&!Array.isArray(item)&&'bufferId' in item){const values=this.buffers.get(item.bufferId);if(!values)throw Error('Missing transferred terrain buffer');return values;}
   if(Array.isArray(item))return item.map(visit);
   if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).map(([key,v])=>[key,visit(v)]));
   return item;
  };
  const meta=visit(packet.meta),objects=await this.objects.decode(packet.objects,yieldTask),stamps=await this.stamps.decode(packet.stamps,yieldTask);
  const ownerRows=await this.owners.decode(packet.owners,yieldTask);
  if(ownerRows!==this.ownerRows){
   const owners=new Map<string,string>();
   for(let i=0;i<ownerRows.length;i++){const row=ownerRows[i]!;owners.set(row.id,(row as {id:string;owner:string}).owner);if(i%4096===4095)await yieldTask();}
   this.ownerRows=ownerRows;this.ownerMap=owners;
  }
  return {...meta,...(meta.generated?{generated:{...meta.generated,objects}}:{}),stamps,resources:await this.resources.decode(packet.resources,yieldTask),owners:this.ownerMap};
 }
}
