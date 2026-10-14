import type {Point} from './state';

type Bounds={minX:number;minY:number;maxX:number;maxY:number};
/** Bounded terrain-derived positions. Callers include all non-terrain inputs in
 * the key and declare the complete collision/ray footprint in bounds. Dynamic
 * bodies, reservations and route decisions must never be stored here. */
export class LocalPositionCache<T=Point> {
 private readonly entries=new Map<string,{bounds:Bounds;points:readonly T[]}>();
 private count=0;
 constructor(private readonly capacity=32768,private readonly limit=16){}
 get(key:string){return this.entries.get(key)?.points;}
 set(key:string,points:readonly T[],bounds:Bounds){
  this.remove(key);
  if(points.length>this.capacity)return;
  while(this.entries.size>=this.limit||this.count+points.length>this.capacity)this.remove(this.entries.keys().next().value!);
  this.entries.set(key,{points,bounds});this.count+=points.length;
 }
 private remove(key:string){const entry=this.entries.get(key);if(entry){this.count-=entry.points.length;this.entries.delete(key);}}
 invalidate(cells:readonly number[],size:number){
  for(const [key,{bounds:b}] of this.entries)if(cells.some(cell=>{
   const x=cell%size,y=Math.floor(cell/size);
   return x>=b.minX&&x<=b.maxX&&y>=b.minY&&y<=b.maxY;
  }))this.remove(key);
 }
 clear(){this.entries.clear();this.count=0;}
}
