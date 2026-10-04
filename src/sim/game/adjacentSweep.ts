import {clearSweep} from './motion';

type Pattern={edges:Int32Array;minX:number;maxX:number;minY:number;maxY:number};

/** Compile the existing footprint sweep for translations between grid centers.
 * Geometry is immutable; the supplied terrain predicate must be pure and is
 * called against current occupancy on every query. No collision result is saved.
 * Arbitrary sub-cell movement and multi-floor portals still use clearSweep.
 */
export function adjacentSweep(size:number,radius:number,step:(a:number,b:number)=>boolean):(from:number,to:number)=>boolean {
 const patterns=new Map<number,Pattern>();
 function pattern(dx:number,dy:number):Pattern {
  const key=(dy+1)*3+dx+1,cached=patterns.get(key);if(cached)return cached;
  // Compile away from boundaries so all footprint rays can be enumerated.
  const origin=Math.ceil(radius/1000)+2,width=origin*2+3;
  const seen=new Set<string>(),edges:number[]=[];
  let minX=0,maxX=0,minY=0,maxY=0;
  clearSweep({x:origin*1000,y:origin*1000},{x:(origin+dx)*1000,y:(origin+dy)*1000},(a,b)=>{
   const ax=a%width-origin,ay=Math.floor(a/width)-origin,bx=b%width-origin,by=Math.floor(b/width)-origin;
   minX=Math.min(minX,ax,bx);maxX=Math.max(maxX,ax,bx);minY=Math.min(minY,ay,by);maxY=Math.max(maxY,ay,by);
   const edge=`${ax}:${ay}:${bx}:${by}`;
   if(!seen.has(edge)){seen.add(edge);edges.push(ay*size+ax,by*size+bx);}
   return true;
  },width,radius);
  const result={edges:Int32Array.from(edges),minX,maxX,minY,maxY};patterns.set(key,result);return result;
 }
 return (from,to)=>{
  if(from<0||to<0||from>=size*size||to>=size*size)return false;
  const x=from%size,y=Math.floor(from/size),dx=to%size-x,dy=Math.floor(to/size)-y;
  if(Math.abs(dx)>1||Math.abs(dy)>1)return false;
  const p=pattern(dx,dy);
  if(x+p.minX<0||x+p.maxX>=size||y+p.minY<0||y+p.maxY>=size)return false;
  for(let i=0;i<p.edges.length;i+=2)if(!step(from+p.edges[i]!,from+p.edges[i+1]!))return false;
  return true;
 };
}
