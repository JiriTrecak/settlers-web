import {CurveIndex} from '../../shared/landscape/curveIndex';
import type {HeightField} from '../../shared/map/height';
import type {ImportedTerrain} from '../../shared/map/importedTerrain';
import {sampleCurve,type TerrainStroke,type CoverPatch} from '../../shared/landscape/curve';
const pack=(bytes:Uint8Array)=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
/** Compile editable ground into the same six-slot material inputs as supplied terrain.
 * This is derived GPU data; it is never stored in the map document. */
export function authoredTerrain(field:HeightField,strokes:readonly TerrainStroke[],cover:readonly CoverPatch[]):ImportedTerrain{
 const blocks=field.span/16,hw=blocks*48+1,mw=blocks*24+1,origin=field.origin;
 const heights=new Uint8Array(hw*hw*2),heightView=new DataView(heights.buffer);
 for(let z=0;z<hw;z++)for(let x=0;x<hw;x++)heightView.setUint16((z*hw+x)*2,Math.round(Math.max(0,Math.min(1,(field.sample(origin+x/3,origin+z/3)+16)/64))*65535),true);
 const masks=Array.from({length:5},()=>new Uint8Array(mw*mw));
 const curves=strokes.map(s=>({...s,curve:new CurveIndex(sampleCurve(s.points,s.radius,1))}));
 for(let z=0;z<mw;z++)for(let x=0;x<mw;x++){
  const wx=origin+x/1.5,wz=origin+z/1.5,i=z*mw+x,h=field.sample(wx,wz),depth=field.waterAt(wx,wz)-h;
  let grass=.65,road=0,rock=0;
  for(const c of cover){const d=Math.hypot(wx-c.x,wz-c.z)/c.radius;if(d<1)grass=Math.max(grass,Math.min(1,(1-d)*6)*Math.min(1,c.density));}
  for(const s of curves){const d=s.curve.distance(wx,wz);if(d>=1)continue;const w=s.opacity*Math.min(1,(1-d)/.45);grass=grass*(1-w)+(s.layer==='grass'?w:0);road=road*(1-w)+(['road','sand','mud'].includes(s.layer)?w:0);rock=rock*(1-w)+(s.layer==='rock'?w:0);}
  const slope=Math.hypot(field.sample(wx+.5,wz)-field.sample(wx-.5,wz),field.sample(wx,wz+.5)-field.sample(wx,wz-.5));
  masks[0]![i]=Math.round(255*grass*Math.max(0,Math.min(1,(h-field.waterAt(wx,wz))/.5)));
  masks[1]![i]=Math.round(255*road);
  masks[2]![i]=Math.round(255*Math.max(0,Math.min(1,(depth+.25)*2)));
  masks[3]![i]=0;
  masks[4]![i]=Math.round(255*Math.max(rock,Math.min(1,Math.max(0,slope-.7))));
 }
 const kinds=[['soil',.25,-1,0],['grass',.25,.5,0],['dirt',.2,.5,0],['waterbed',.05,-1,0],['stones',.4,.25,0],['rock',.16,-1,1]] as const;
 const slots=new Uint8Array(blocks*blocks*16*6);for(let i=0;i<slots.length;i++)slots[i]=i%6;
 return {version:1,source:'authored-scouring',sha256:'0'.repeat(64),origin:[origin,origin],sourceOrigin:[origin,origin],blocks:[blocks,blocks],heightSize:[hw,hw],height:pack(heights),heightOffset:-16,maskSize:[mw,mw],layers:kinds.map(([name,tiling,blend,edge],i)=>({name,ar:`tiles_${name}_ar__d_a`,nh:`tiles_${name}_nh__d_a`,tiling,blend,edge,verticality:0,desaturation:0,...(i?{mask:pack(masks[i-1]!)}:{})})),layerSlots:pack(slots),grass:[],water:[]};
}
