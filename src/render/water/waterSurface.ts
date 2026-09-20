import {HeightField} from '../../shared/map/height';
import {sourceHeight,unpackSourceBytes,type ImportedTerrain} from '../../shared/map/importedTerrain';
import {sourceWater} from '../../shared/map/importedWater';
import {nearestSpline} from '../../shared/authoring/shapes';
export type WaterSurfaceData={origin:[number,number];offset:[number,number];size:[number,number];heightOffset:number;ground:Float32Array;groundSize:[number,number];groundScale:number;flow:Uint8Array;color?:{bytes:Uint8Array;size:[number,number]};tiles:{x:number;z:number;positions:Float32Array;indices:number[]}[]};
/** Both imported maps and editable rivers feed the same source water renderer. */
export function waterSurface(input:ImportedTerrain|HeightField):WaterSurfaceData{
 const native=input instanceof HeightField;
 if(!native){
  const water=sourceWater(input),h=sourceHeight(input),ground=Float32Array.from(h.values,v=>v*64/65535+input.heightOffset);
  return {origin:input.origin,offset:[input.origin[0]-input.sourceOrigin[0],input.origin[1]-input.sourceOrigin[1]],size:[water.width,water.depth],heightOffset:input.heightOffset,ground,groundSize:input.heightSize,groundScale:3,flow:water.flow,color:input.groundColor?{bytes:unpackSourceBytes(input.groundColor.rgba),size:input.groundColor.size}:undefined,tiles:input.water.map(b=>tile(b.x,b.z,input.origin,(x,z)=>water.sample(x,z),()=>true))};
 }
 const field=input,span=field.verts-1,origin:[number,number]=[field.origin,field.origin],flow=new Uint8Array(span*span*4),wet=new Set<string>();
 const surface=(x:number,z:number)=>field.waterAt(x,z);
 for(let z=0;z<span;z++)for(let x=0;x<span;x++){
  const wx=x+origin[0]+.5,wz=z+origin[1]+.5,i=(z*span+x)*4;
  flow[i]=flow[i+1]=128;flow[i+3]=255;
  if(field.sample(wx,wz)>surface(wx,wz)+.15)continue;
  wet.add(Math.floor(x/16)+':'+Math.floor(z/16));
  for(const river of field.watercourses){const p=nearestSpline(wx,wz,river.samples);if(p.offset>river.width*p.widthScale/2)continue;
   const speed=Math.min(.9,river.flow*p.flowScale*river.style.flowSpeed*.25);
   flow[i]=Math.round(128+127*p.direction.x*speed);flow[i+1]=Math.round(128+127*p.direction.z*speed);
   flow[i+2]=Math.round(255*river.style.foamStrength*Math.min(1,river.flow/2)*.35);break;
  }
 }
 return {origin,offset:[0,0],size:[span,span],heightOffset:0,ground:field.samples.slice(),groundSize:[field.verts,field.verts],groundScale:1,flow,tiles:[...wet].map(key=>{const [x,z]=key.split(':').map(Number);return tile(x!,z!,origin,surface,(wx,wz)=>field.sample(wx,wz)<=surface(wx,wz)+.15);})};
}
function tile(bx:number,bz:number,origin:[number,number],height:(x:number,z:number)=>number,wet:(x:number,z:number)=>boolean){
 const positions=new Float32Array(17*17*3),indices:number[]=[];
 for(let z=0;z<=16;z++)for(let x=0;x<=16;x++){const wx=origin[0]+bx*16+x,wz=origin[1]+bz*16+z,i=(z*17+x)*3;positions[i]=wx;positions[i+1]=height(wx,wz);positions[i+2]=wz;}
 for(let z=0;z<16;z++)for(let x=0;x<16;x++){const wx=origin[0]+bx*16+x,wz=origin[1]+bz*16+z;if(!wet(wx+.5,wz+.5)&&!wet(wx,wz)&&!wet(wx+1,wz)&&!wet(wx,wz+1)&&!wet(wx+1,wz+1))continue;const a=z*17+x,b=a+1,c=a+17,d=c+1;indices.push(a,c,b,b,c,d);}
 return {x:bx,z:bz,positions,indices};
}
