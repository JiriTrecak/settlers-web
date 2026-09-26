import {riverPoint,type CompiledRiver} from './generate';
import {shapeBounds} from './layers';
import type {WaterProfile} from './recipes';
import {type SplineSample} from './shapes';
export type Watercourse=CompiledRiver&{style:WaterProfile};
type Segment={river:CompiledRiver;a:SplineSample;b:SplineSample};
/** Indexed once per generation. Navigation and ground picking share this surface query. */
export class WatercourseIndex{
 private areas=new Map<string,CompiledRiver[]>();
 private cells=new Map<string,Segment[]>();
 constructor(rivers:readonly CompiledRiver[]){
  for(const river of rivers){if(!river.area)continue;const b=shapeBounds(river.area);for(let z=Math.floor(b.minZ/16);z<=Math.floor(b.maxZ/16);z++)for(let x=Math.floor(b.minX/16);x<=Math.floor(b.maxX/16);x++){const key=x+':'+z,list=this.areas.get(key)??[];list.push(river);this.areas.set(key,list);}}
  for(const river of rivers)for(let i=1;i<river.samples.length;i++){
   const a=river.samples[i-1]!,b=river.samples[i]!,r=river.width*Math.max(a.widthScale,b.widthScale)/2;
   for(let z=Math.floor((Math.min(a.z,b.z)-r)/16);z<=Math.floor((Math.max(a.z,b.z)+r)/16);z++)for(let x=Math.floor((Math.min(a.x,b.x)-r)/16);x<=Math.floor((Math.max(a.x,b.x)+r)/16);x++){
    const key=x+':'+z,list=this.cells.get(key)??[];list.push({river,a,b});this.cells.set(key,list);
   }
  }
 }
 sample(x:number,z:number):number|undefined{
  let level:number|undefined;
  for(const {river,a,b}of this.cells.get(Math.floor(x/16)+':'+Math.floor(z/16))??[]){
   const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz,t=length?Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/length)):0;
   if(Math.hypot(x-(a.x+dx*t),z-(a.z+dz*t))<=river.width*(a.widthScale+(b.widthScale-a.widthScale)*t)/2)level=Math.max(level??-Infinity,a.elevation+(b.elevation-a.elevation)*t);
  }
  for(const river of this.areas.get(Math.floor(x/16)+':'+Math.floor(z/16))??[]){const p=riverPoint(x,z,river);if(p.offset<=river.width/2)level=Math.max(level??-Infinity,p.elevation);}
  return level;
 }
}
