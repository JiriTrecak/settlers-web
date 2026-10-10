import type {EntityView} from '../../sim/game/observation';
import type {HeightField} from '../../shared/map/height';

/** Rendering budgets and art tuning, shared by the emitter and GPU pass. */
export const WATER_DISTURBANCES={capacity:1536,emissionsPerFrame:256,lifetime:2.8,spacing:1.7,
 resolution:768,span:160,strength:.3,expansion:1.1,width:.28} as const;
export const DISTURBANCE_STRIDE=8;
type Track={x:number;z:number;distance:number;seen:number;wet:boolean};
/** A bounded ring buffer. Movement is sampled by distance, never by frame count.
 * Stores cosmetic history only; no simulation/network state or fog queries. */
export class WaterDisturbances {
 readonly data=new Float32Array(WATER_DISTURBANCES.capacity*DISTURBANCE_STRIDE);
 private tracks=new Map<number,Track>();
 head=0;count=0;private frame=0;private cursor=0;private previousTime:number|undefined;
 emitted=0;
 update(entities:readonly EntityView[],field:HeightField,time:number,focusX:number,focusZ:number){
  const cfg=WATER_DISTURBANCES,dt=this.previousTime===undefined?0:time-this.previousTime;
  if(dt<0||dt>1){this.clear();}this.previousTime=time;
  while(this.count&&time-this.data[this.head*DISTURBANCE_STRIDE+2]!>=cfg.lifetime){this.head=(this.head+1)%cfg.capacity;this.count--;}
  const frame=++this.frame;this.emitted=0;
  for(let j=0;j<entities.length;j++){
   const e=entities[(j+this.cursor)%entities.length]!;
   if(!e.unit||e.unit.contained||e.unit.flight||e.unit.garrison||e.remembered||(e.hp!==null&&e.hp<=0))continue;
   // No work or history for distant armies. Re-entering the window seeds a new
   // track instead of drawing a wake all the way from an old position.
   if(Math.abs(e.x-focusX)>cfg.span*.5+5||Math.abs(e.y-focusZ)>cfg.span*.5+5)continue;
   const level=field.waterAt(e.x,e.y),feet=field.walkSample(e.x,e.y,e.surface)+(e.elevation??0);
   const wet=Number.isFinite(level)&&level-feet>.035;
   let track=this.tracks.get(e.id);
   if(!track){track={x:e.x,z:e.y,distance:((e.id*0.61803398875)%1)*cfg.spacing,seen:frame,wet};this.tracks.set(e.id,track);continue;}
   track.seen=frame;
   const dx=e.x-track.x,dz=e.y-track.z,distance=Math.hypot(dx,dz),before=track.distance;
   const moved=distance>.00001&&dt>0&&distance<Math.max(2,dt*30);
   if(moved){
    if(wet){
     track.distance+=distance;
     // Entry creates one ring; normal movement emits equally spaced wakes.
     let along=track.wet?cfg.spacing-before:distance;
     for(let n=0;along<=distance&&n<3;n++,along+=cfg.spacing){
      if(this.emitted>=cfg.emissionsPerFrame)break;
      const f=Math.min(1,along/distance),x=track.x+dx*f,z=track.z+dz*f;
      const water=field.waterAt(x,z),bed=field.walkSample(x,z,e.surface)+(e.elevation??0);
      if(water-bed<=.035)continue;
      const speed=distance/dt,strength=cfg.strength*Math.min(1,(water-bed)/.18)*Math.min(1,.45+speed*.16);
      this.push(x,z,time,water,dx/distance,dz/distance,strength,1+Math.min(.45,speed*.07));
     }
     track.distance%=cfg.spacing;
    }else track.distance=0;
   }else if(distance>0){track.distance=0;}
   track.x=e.x;track.z=e.y;track.wet=wet;
  }
  for(const [id,track] of this.tracks)if(track.seen!==frame)this.tracks.delete(id);
  this.cursor=entities.length?(this.cursor+cfg.emissionsPerFrame)%entities.length:0;
 }
 private push(x:number,z:number,time:number,level:number,dx:number,dz:number,strength:number,stretch:number){
  const cfg=WATER_DISTURBANCES;
  if(this.count===cfg.capacity){this.head=(this.head+1)%cfg.capacity;this.count--;}
  const at=((this.head+this.count)%cfg.capacity)*DISTURBANCE_STRIDE;
  const d=this.data;d[at]=x;d[at+1]=z;d[at+2]=time;d[at+3]=level;d[at+4]=dx;d[at+5]=dz;d[at+6]=strength;d[at+7]=stretch;this.count++;this.emitted++;
 }
 clear(){this.tracks.clear();this.head=0;this.count=0;this.previousTime=undefined;}
}
