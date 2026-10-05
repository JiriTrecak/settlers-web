import {MAX_GROUND_STEP_CM} from '../../shared/map/tacticalTerrain';
import type {Point} from '../game/state';
import type {SimulationProfiler} from '../profiling';
const directions=[[1,0],[-1,0],[0,1],[0,-1]] as const;
/** Synchronous scratch space, not a result cache. The AI's original bounded BFS
 * and visitation order are preserved, including its unmarked initial node. */
export class PlacementSearch {
 private seen=new Uint32Array(0);
 private xs=new Int32Array(0);
 private ys=new Int32Array(0);
 private generation=0;
 reachable(map:{size:number;land:readonly number[];heights:readonly number[]},blocked:ReadonlySet<number>,proposed:ReadonlySet<number>,origin:Point,door:Point,radius:number,profile?:SimulationProfiler):boolean {
  const minX=Math.floor(origin.x-radius),minY=Math.floor(origin.y-radius),radiusSquared=radius*radius;
  const width=Math.ceil(origin.x+radius)-minX+1,height=Math.ceil(origin.y+radius)-minY+1,capacity=width*height;
  if(this.seen.length<capacity){this.seen=new Uint32Array(capacity);this.xs=new Int32Array(capacity+1);this.ys=new Int32Array(capacity+1);}
  this.generation=(this.generation+1)>>>0;if(!this.generation){this.seen.fill(0);this.generation=1;}
  this.xs[0]=Math.round(origin.x);this.ys[0]=Math.round(origin.y);
  let tail=1,expanded=0;
  try{
   for(let head=0;head<tail&&head<4096;head++){
    const x=this.xs[head]!,y=this.ys[head]!;expanded++;
    if((x-door.x)**2+(y-door.y)**2<1)return true;
    const from=y*map.size+x;
    for(const [dx,dy] of directions){
     const nx=x+dx,ny=y+dy,index=ny*map.size+nx,local=(ny-minY)*width+nx-minX;
     if(nx<0||ny<0||nx>=map.size||ny>=map.size||(nx-origin.x)**2+(ny-origin.y)**2>radiusSquared||
       this.seen[local]===this.generation||proposed.has(index)||blocked.has(index)||!map.land[index]||
       Math.abs(map.heights[index]!-map.heights[from]!)>MAX_GROUND_STEP_CM)continue;
     this.seen[local]=this.generation;this.xs[tail]=nx;this.ys[tail++]=ny;
    }
   }
   return false;
  }finally{profile?.count('Approach cells expanded',expanded);}
 }
}
