import type {CompiledRiver} from './generate';
import type {WaterProfile} from './recipes';
import {nearestSpline,type SplineSample} from './shapes';
export type Watercourse=CompiledRiver&{style:WaterProfile};
type Segment={river:CompiledRiver;a:SplineSample;b:SplineSample};
/** Indexed once per generation. Navigation and ground picking share this surface query. */
export class WatercourseIndex{
 private cells=new Map<string,Segment[]>();
 constructor(rivers:readonly CompiledRiver[]){
  for(const river of rivers)for(let i=1;i<river.samples.length;i++){
   const a=river.samples[i-1]!,b=river.samples[i]!,r=river.width*Math.max(a.widthScale,b.widthScale)/2;
   for(let z=Math.floor((Math.min(a.z,b.z)-r)/16);z<=Math.floor((Math.max(a.z,b.z)+r)/16);z++)for(let x=Math.floor((Math.min(a.x,b.x)-r)/16);x<=Math.floor((Math.max(a.x,b.x)+r)/16);x++){
    const key=x+':'+z,list=this.cells.get(key)??[];list.push({river,a,b});this.cells.set(key,list);
   }
  }
 }
 sample(x:number,z:number):number|undefined{
  let level:number|undefined;
  for(const {river,a,b}of this.cells.get(Math.floor(x/16)+':'+Math.floor(z/16))??[]){const p=nearestSpline(x,z,[a,b]);if(p.offset<=river.width*p.widthScale/2)level=Math.max(level??-Infinity,p.elevation);}
  return level;
 }
}
