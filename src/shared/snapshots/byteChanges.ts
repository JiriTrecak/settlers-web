type Receipt = {revision:number; indices:readonly number[]};
type Publication = {journal:ByteChangeJournal; revision:number};
const publications=new WeakMap<Uint8Array,Publication>();

/** Optional local acceleration metadata for immutable byte snapshots. Never part
 * of a save or wire protocol. History holds indices only, not old byte arrays. */
export class ByteChangeJournal {
  private revision=0;
  private indices=0;
  private readonly history:Receipt[]=[];
  constructor(initial:Uint8Array){publications.set(initial,{journal:this,revision:0});}

  /** Both the published bytes and borrowed indices must remain immutable. */
  publish(cells:Uint8Array,indices:readonly number[]):void {
    const revision=++this.revision;
    this.history.push({revision,indices});this.indices+=indices.length;
    // Coalescing is bounded. A long stall or very large update safely falls back
    // to a full comparison, without retaining an entire match's change history.
    while(this.history.length>16||this.indices>16384)this.indices-=this.history.shift()!.indices.length;
    publications.set(cells,{journal:this,revision});
  }

  between(before:number,after:number):readonly (readonly number[])[]|undefined {
    if(before===after)return [];
    if(before>after||!this.history.length||this.history[0]!.revision>before+1||this.revision<after)return;
    return this.history.filter(receipt=>receipt.revision>before&&receipt.revision<=after).map(receipt=>receipt.indices);
  }
}

/** Undefined means no complete receipt is available; callers must compare bytes.
 * Repeated indices across receipts are intentional and can be applied in order. */
export function byteChangesBetween(before:Uint8Array|undefined,after:Uint8Array):readonly (readonly number[])[]|undefined {
  const a=before&&publications.get(before),b=publications.get(after);
  if(!a||!b||a.journal!==b.journal||before!.length!==after.length)return;
  return a.journal.between(a.revision,b.revision);
}
