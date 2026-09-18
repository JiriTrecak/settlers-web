export const SECTOR_SIZE=16;
export type Bounds={minX:number;minY:number;maxX:number;maxY:number};
type Entry<T>={value:T;bounds:Bounds;loX:number;loY:number;hiX:number;hiY:number};
/** Spatial broad phase. Large footprints occupy every intersected sector;
 * callers retain precise range, ownership and line-of-sight checks. */
export class SectorIndex<T> {
 private readonly buckets=new Map<string,Set<number>>();
 private readonly entries=new Map<number,Entry<T>>();
 readonly visits={sectors:0,candidates:0};
 constructor(readonly width=SECTOR_SIZE){}
 clear(){this.buckets.clear();this.entries.clear();}
 private key(x:number,y:number){return `${x}:${y}`;}
 set(id:number,value:T,bounds:Bounds){
  const loX=Math.floor(bounds.minX/this.width),loY=Math.floor(bounds.minY/this.width),hiX=Math.floor(bounds.maxX/this.width),hiY=Math.floor(bounds.maxY/this.width);
  const old=this.entries.get(id);
  if(old&&old.loX===loX&&old.loY===loY&&old.hiX===hiX&&old.hiY===hiY){old.value=value;old.bounds=bounds;return;}
  this.delete(id);this.entries.set(id,{value,bounds,loX,loY,hiX,hiY});
  for(let y=loY;y<=hiY;y++)for(let x=loX;x<=hiX;x++){
   const key=this.key(x,y),bucket=this.buckets.get(key)??new Set<number>();bucket.add(id);this.buckets.set(key,bucket);
  }
 }
 delete(id:number){
  const old=this.entries.get(id);if(!old)return;
  for(let y=old.loY;y<=old.hiY;y++)for(let x=old.loX;x<=old.hiX;x++){
   const key=this.key(x,y),bucket=this.buckets.get(key)!;bucket.delete(id);if(!bucket.size)this.buckets.delete(key);
  }
  this.entries.delete(id);
 }
 ids(){return this.entries.keys();}
 *query(bounds:Bounds):Iterable<T>{
  this.visits.sectors=0;this.visits.candidates=0;
  const seen=new Set<number>();
  for(let y=Math.floor(bounds.minY/this.width);y<=Math.floor(bounds.maxY/this.width);y++)
   for(let x=Math.floor(bounds.minX/this.width);x<=Math.floor(bounds.maxX/this.width);x++){
    this.visits.sectors++;
    for(const id of this.buckets.get(this.key(x,y))??[]){
     if(seen.has(id))continue;seen.add(id);this.visits.candidates++;
     const entry=this.entries.get(id)!,b=entry.bounds;
     if(b.maxX<bounds.minX||b.minX>bounds.maxX||b.maxY<bounds.minY||b.minY>bounds.maxY)continue;
     yield entry.value;
    }
   }
 }
}
