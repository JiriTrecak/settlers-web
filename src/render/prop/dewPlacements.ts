export type DewContributor={dewWorld?:Float32Array};
type Slot={offset:number;length:number};

/** Packed snapshots of visible dew only. Pose edits replace their own ranges;
 * membership/length changes rebuild in placement order. Old buffers stay intact. */
export class DewPlacements {
 dew=new Float32Array(0);
 private slots=new WeakMap<DewContributor,Slot>();
 sync(all:()=>Iterable<DewContributor>,changed:readonly DewContributor[],structural:boolean):void {
  if(!structural)for(const source of changed){
   if((this.slots.get(source)?.length??0)!==(source.dewWorld?.length??0)){structural=true;break;}
  }
  if(structural){
   const beads:Float32Array[]=[];
   this.slots=new WeakMap();let length=0;
   for(const source of all()){
    const count=source.dewWorld?.length??0;if(!count)continue;
    this.slots.set(source,{offset:length,length:count});beads.push(source.dewWorld!);length+=count;
   }
   const dew=new Float32Array(length);let offset=0;
   for(const part of beads){dew.set(part,offset);offset+=part.length;}
   this.dew=dew;return;
  }
  let dew=this.dew;
  for(const source of changed){
   const slot=this.slots.get(source);if(!slot)continue;
   if(dew===this.dew)dew=dew.slice();
   dew.set(source.dewWorld!,slot.offset);
  }
  this.dew=dew;
 }
}
