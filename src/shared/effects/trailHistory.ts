/** Bounded presentation history. Never part of simulation state, saves or checksums. */
export type TrailPoint={tick:number;x:number;y:number;z:number};
export type TrailSnapshot={cast:number;points:TrailPoint[]};
export const TRAIL_HISTORY_TICKS=80;
export class TrailHistory {
 private paths=new Map<number,TrailPoint[]>();private tick=-1;
 record(tick:number,points:readonly {cast:number;x:number;y:number;z:number}[]){
  if(tick<this.tick)this.clear();this.tick=tick;
  const live=new Set(points.map(p=>p.cast));
  for(const [cast,path]of this.paths)if(!live.has(cast)||path.at(-1)!.tick<tick-TRAIL_HISTORY_TICKS)this.paths.delete(cast);
  for(const point of points){
   let path=this.paths.get(point.cast);if(!path){if(this.paths.size>=64)continue;this.paths.set(point.cast,path=[]);}
   const sample={tick,x:point.x,y:point.y,z:point.z};
   if(path.at(-1)?.tick===tick)path[path.length-1]=sample;else path.push(sample);
   while(path.length>TRAIL_HISTORY_TICKS+2||path.length>1&&path[1].tick<tick-TRAIL_HISTORY_TICKS)path.shift();
  }
  for(const [cast,path]of this.paths)if(path.at(-1)!.tick<tick-TRAIL_HISTORY_TICKS)this.paths.delete(cast);
 }
 snapshot():TrailSnapshot[]{return [...this.paths].map(([cast,points])=>({cast,points:points.map(p=>({...p}))}));}
 clear(){this.paths.clear();this.tick=-1;}
}
