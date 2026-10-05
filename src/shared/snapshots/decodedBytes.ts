export type BytePatch = {full:Uint8Array}|{changes:Uint32Array};
type Receipt = {revision:number; packed:Uint32Array};
type Stream = {revision:number; count:number; history:Receipt[]};
export type DecodedByteCursor = {readonly stream:Stream; readonly revision:number};
const cursors=new WeakMap<Uint8Array,DecodedByteCursor>();

/** Local receipts for mutable decoded buffers. Consumers save a cursor, never
 * use buffer identity as a change test. The wire's packed indices are reused;
 * no second scan, hash, byte copy, or additional protocol data is required. */
export function decodeBytePatch(patch:BytePatch,previous?:Uint8Array):Uint8Array {
  if('full' in patch){
    cursors.set(patch.full,{stream:{revision:0,count:0,history:[]},revision:0});
    return patch.full;
  }
  if(!previous)throw Error('Fog delta without baseline');
  for(const packed of patch.changes)previous[Math.floor(packed/4)]=packed%4;
  if(patch.changes.length){
    const stream=cursors.get(previous)?.stream??{revision:0,count:0,history:[]};
    const revision=++stream.revision;
    stream.history.push({revision,packed:patch.changes});stream.count+=patch.changes.length;
    while(stream.history.length>16||stream.count>16384)stream.count-=stream.history.shift()!.packed.length;
    cursors.set(previous,{stream,revision});
  }
  return previous;
}

export function decodedByteCursor(cells:Uint8Array):DecodedByteCursor|undefined {return cursors.get(cells);}

/** Undefined requires a full refresh (untracked data, replaced buffer, or a
 * consumer stalled beyond bounded history). Empty means no changed bytes. */
export function decodedByteChanges(before:DecodedByteCursor|undefined,cells:Uint8Array):readonly Uint32Array[]|undefined {
  const after=cursors.get(cells);
  if(!before||!after||before.stream!==after.stream)return;
  if(before.revision===after.revision)return [];
  const history=after.stream.history;
  if(before.revision>after.revision||!history.length||history[0]!.revision>before.revision+1)return;
  return history.filter(receipt=>receipt.revision>before.revision).map(receipt=>receipt.packed);
}
