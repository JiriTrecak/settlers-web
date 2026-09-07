import type { HeightField } from '../map/height';
export type Landform = {x:number;z:number;radiusX:number;radiusZ:number;height:number;rotation:number;plateau:number;roughness:number;seed:number};
/** Add an elliptical hill/basin with a flat optional crown and C1-continuous shoulders. */
export function applyLandform(field:HeightField, shape:Landform):void {
  const c=Math.cos(shape.rotation),s=Math.sin(shape.rotation);
  for(let iz=0;iz<field.verts;iz++)for(let ix=0;ix<field.verts;ix++){
    const x=ix+field.origin-shape.x,z=iz+field.origin-shape.z;
    const u=(x*c+z*s)/shape.radiusX,v=(-x*s+z*c)/shape.radiusZ;
    const angle=Math.atan2(v,u);
    const irregular=1+shape.roughness*(Math.sin(angle*3+shape.seed*.17)*.6+Math.sin(angle*5-shape.seed*.11)*.4);
    const r=Math.hypot(u,v)/irregular;
    if(r>=1)continue;
    const t=Math.max(0,(r-shape.plateau)/(1-shape.plateau));
    const weight=1-t*t*(3-2*t);
    const i=iz*field.verts+ix;
    field.samples[i]=Math.max(-16,Math.min(24,field.samples[i]!+shape.height*weight));
  }
}
