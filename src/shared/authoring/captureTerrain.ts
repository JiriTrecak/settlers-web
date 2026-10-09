import type {HeightField} from '../map/height';
import {encodeBytes,encodeFloats,type TerrainData} from '../map/terrainData';
import {riverPoint} from './generate';

/** Called by Apply in the editor. No river curves survive this operation. */
export function captureTerrain(field:HeightField):TerrainData{
 const n=field.samples.length,span=field.span,profiles=[...(field.cellWater?.profiles??[])];
 const flow=field.cellWater?.flow.slice()??new Uint8Array(span*span*4);
 if(!field.cellWater)for(let i=0;i<flow.length;i+=4){flow[i]=flow[i+1]=128;}
 for(const river of field.watercourses)if(!profiles.includes(river.profile))profiles.push(river.profile);
 if(profiles.length>255)throw Error('Too many water profiles');
 const heights=new Float32Array(n),water=new Float32Array(n);
 for(let z=0;z<field.verts;z++)for(let x=0;x<field.verts;x++){
  const wx=field.origin+x,wz=field.origin+z,i=z*field.verts+x;
  heights[i]=field.sample(wx,wz);water[i]=field.waterAt(wx,wz);
 }
 for(let z=0;z<span;z++)for(let x=0;x<span;x++)for(const river of field.watercourses){
  const p=riverPoint(field.origin+x+.5,field.origin+z+.5,river);if(p.offset>river.width*p.widthScale/2)continue;
  const i=(z*span+x)*4,speed=Math.min(.9,river.flow*p.flowScale*river.style.flowSpeed*.25);
  flow[i]=Math.round(128+127*p.direction.x*speed);flow[i+1]=Math.round(128+127*p.direction.z*speed);
  flow[i+2]=Math.round(255*river.style.foamStrength*Math.min(1,river.flow/2)*.35);flow[i+3]=profiles.indexOf(river.profile)+1;break;
 }
 const paint=new Map<string,Float32Array>();
 for(const p of field.surfacePaint??[]){const values=paint.get(p.material)??new Float32Array(n);for(let i=0;i<n;i++)values[i]=Math.max(values[i],p.weights[i]);paint.set(p.material,values);}
 return {version:1,size:field.size,heights:encodeFloats(heights),waterHeights:encodeFloats(water),waterFlow:encodeBytes(flow),waterProfiles:profiles,
  grass:encodeFloats(field.grassCoverage??new Float32Array(n)),rock:encodeFloats(field.rockCoverage??new Float32Array(n)),
  paint:[...paint].map(([material,weights])=>({material,weights:encodeFloats(weights)}))};
}
