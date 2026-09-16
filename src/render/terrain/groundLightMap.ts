import {Color} from 'three';
export type GroundLamp={x:number;y:number;z:number;color:string;intensity:number;range:number};
/** Bake diffuse lamp bounce into spare channels of the contact map. No extra sampler
 * or per-fragment light loop; terrain ridges stop light reaching adjacent rooms.
 */
export function bakeGroundLights(data:Uint8Array,size:number,origin:number,span:number,sample:(x:number,z:number)=>number,lamps:readonly GroundLamp[]):void {
 for(let i=0;i<data.length;i+=4)data[i+1]=data[i+2]=data[i+3]=0;
 const scale=size/span,color=new Color();
 for(const lamp of lamps){
  const radius=Math.min(14,lamp.range),rgb=color.set(lamp.color).toArray();
  const minX=Math.max(0,Math.floor((lamp.x-radius-origin)*scale)),maxX=Math.min(size-1,Math.ceil((lamp.x+radius-origin)*scale));
  const minZ=Math.max(0,Math.floor((lamp.z-radius-origin)*scale)),maxZ=Math.min(size-1,Math.ceil((lamp.z+radius-origin)*scale));
  for(let iz=minZ;iz<=maxZ;iz++)for(let ix=minX;ix<=maxX;ix++){
   const x=origin+(ix+.5)/scale,z=origin+(iz+.5)/scale,y=sample(x,z),dx=x-lamp.x,dz=z-lamp.z,dy=y-lamp.y;
   const distance=Math.hypot(dx,dy,dz);if(distance>=radius||dy>.2)continue;
   let blocked=false;const steps=Math.max(2,Math.ceil(Math.hypot(dx,dz)/1.5));
   for(let j=1;j<steps;j++){const t=j/steps;if(sample(lamp.x+dx*t,lamp.z+dz*t)>lamp.y+dy*t+.15){blocked=true;break;}}
   if(blocked)continue;
   const edge=1-(distance/radius)**2,value=Math.min(1,lamp.intensity/(6+distance*distance)*edge*edge)*255,i=(iz*size+ix)*4;
   for(let c=0;c<3;c++)data[i+c+1]=Math.min(255,data[i+c+1]!+Math.round(value*rgb[c]!));
  }
 }
}
