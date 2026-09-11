import {HEIGHT_MIN,HEIGHT_MAX,type HeightField} from '../map/height';
import {sampleCurve,type CurvePoint} from './curve';
const clamp=(h:number)=>Math.max(HEIGHT_MIN,Math.min(HEIGHT_MAX,h));
/** Closed plateau outline. Absolute height and narrow shoulders create cliffs;
 * reapplying the outline never accumulates height or rounds the crown. */
export function sculptPlateau(field:HeightField,points:readonly CurvePoint[],height:number):void {
  if(points.length<3)throw new Error('A plateau needs at least three outline points');
  const loX=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x))-field.origin));
  const hiX=Math.min(field.verts-1,Math.ceil(Math.max(...points.map(p=>p.x))-field.origin));
  const loZ=Math.max(0,Math.floor(Math.min(...points.map(p=>p.z))-field.origin));
  const hiZ=Math.min(field.verts-1,Math.ceil(Math.max(...points.map(p=>p.z))-field.origin));
  for(let iz=loZ;iz<=hiZ;iz++)for(let ix=loX;ix<=hiX;ix++){
    const x=ix+field.origin,z=iz+field.origin;let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const a=points[i],b=points[j];
      if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
    }
    if(inside)field.samples[iz*field.verts+ix]=clamp(height);
  }
}
/** Curve ramp joins the sampled endpoint levels with a constant longitudinal
 * grade. Full-width floor, half-cell shoulder; neighbouring cliffs stay sharp. */
export function sculptRamp(field:HeightField,points:readonly CurvePoint[],radius:number):void {
  if(points.length<2)throw new Error('A ramp needs a lower and upper endpoint');
  const curve=sampleCurve(points,radius,.5),start=field.sample(points[0].x,points[0].z),end=field.sample(points.at(-1)!.x,points.at(-1)!.z);
  const lengths=[0];
  for(let i=1;i<curve.length;i++)lengths.push(lengths[i-1]+Math.hypot(curve[i].x-curve[i-1].x,curve[i].z-curve[i-1].z));
  const total=lengths.at(-1)!;if(total<1)throw new Error('Ramp endpoints must be separated');
  if(Math.abs(end-start)/total>.65)throw new Error('Ramp too steep: extend its length (maximum rise 0.65 m per metre)');
  const original=field.samples.slice(),distance=new Float32Array(original.length).fill(Infinity);
  for(let j=0;j<curve.length-1;j++){
    const a=curve[j],b=curve[j+1],dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
    const width=Math.max(a.radius,b.radius)+.5;
    for(let iz=Math.max(0,Math.floor(Math.min(a.z,b.z)-width-field.origin));iz<=Math.min(field.verts-1,Math.ceil(Math.max(a.z,b.z)+width-field.origin));iz++)
      for(let ix=Math.max(0,Math.floor(Math.min(a.x,b.x)-width-field.origin));ix<=Math.min(field.verts-1,Math.ceil(Math.max(a.x,b.x)+width-field.origin));ix++){
        const x=ix+field.origin,z=iz+field.origin,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(len2||1)));
        const d=Math.hypot(x-a.x-dx*t,z-a.z-dz*t),r=a.radius+(b.radius-a.radius)*t,i=iz*field.verts+ix;
        if(d>r+.5||d>=distance[i])continue;distance[i]=d;
        const height=start+(end-start)*(lengths[j]+Math.sqrt(len2)*t)/total;
        const blend=Math.max(0,Math.min(1,r+.5-d));
        field.samples[i]=clamp(original[i]+(height-original[i])*blend);
      }
  }
}
