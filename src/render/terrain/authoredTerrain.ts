import {biomeById,biomeTerrainTile} from '../../content/biomes';
import {CurveIndex} from '../../shared/landscape/curveIndex';
import type {HeightField} from '../../shared/map/height';
import type {ImportedTerrain} from '../../shared/map/importedTerrain';
import {sampleCurve,type TerrainStroke,type CoverPatch} from '../../shared/landscape/curve';
const pack=(bytes:Uint8Array)=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
/** Compile editable ground into the same six-slot material inputs as supplied terrain.
 * This is derived GPU data; it is never stored in the map document. */
export function authoredTerrain(field:HeightField,strokes:readonly TerrainStroke[],cover:readonly CoverPatch[]):ImportedTerrain{
 const blocks=field.span/16,hw=field.verts,mw=field.verts,origin=field.origin;
 const heights=new Uint8Array(hw*hw*2),heightView=new DataView(heights.buffer);
 for(let z=0;z<hw;z++)for(let x=0;x<hw;x++)heightView.setUint16((z*hw+x)*2,Math.round(Math.max(0,Math.min(1,(field.sample(origin+x,origin+z)+16)/64))*65535),true);
 const biome=biomeById(field.biome);
 const channels=['soil','grass','dirt','waterbed','stones','rock'] as const;
 const paints=(field.surfacePaint??[]).map(p=>({...p,channel:channels.findIndex(c=>{const ar=biomeTerrainTile(biome,c).ar;return p.material===ar;})})).filter(p=>p.channel>=0);
 const masks=Array.from({length:5},()=>new Uint8Array(mw*mw));
 const curves=strokes.map(s=>({...s,curve:new CurveIndex(sampleCurve(s.points,s.radius,1))}));
 for(let z=0;z<mw;z++)for(let x=0;x<mw;x++){
  const wx=origin+x,wz=origin+z,i=z*mw+x,h=field.sample(wx,wz),depth=field.waterAt(wx,wz)-h;
  const gx=Math.max(0,Math.min(field.verts-1,Math.round(wx-field.origin))),gz=Math.max(0,Math.min(field.verts-1,Math.round(wz-field.origin)));
  let grass=field.grassCoverage?.[gz*field.verts+gx]??0,road=0,stones=0,bed=0,rock=field.rockCoverage?.[gz*field.verts+gx]??0;
  for(const c of cover){const d=Math.hypot(wx-c.x,wz-c.z)/c.radius;if(d<1)grass=Math.max(grass,Math.min(1,(1-d)*6)*Math.min(1,c.density));}
  for(const s of curves){const d=s.curve.distance(wx,wz);if(d>=1)continue;const w=s.opacity*Math.min(1,(1-d)/.45);grass=grass*(1-w)+(s.layer==='grass'?w:0);road=road*(1-w)+(['road','mud'].includes(s.layer)?w:0);rock=rock*(1-w)+(s.layer==='rock'?w:0);}
  for(const p of paints){const w=p.weights[i]??0;if(w<=0)continue;grass=grass*(1-w)+(p.channel===1?w:0);road=road*(1-w)+(p.channel===2?w:0);stones=stones*(1-w)+(p.channel===4?w:0);rock=rock*(1-w)+(p.channel===5?w:0);bed=bed*(1-w)+(p.channel===3?w:0);}
  const slope=Math.hypot(field.sample(wx+.5,wz)-field.sample(wx-.5,wz),field.sample(wx,wz+.5)-field.sample(wx,wz-.5));
  masks[0]![i]=Math.round(255*grass*Math.max(0,Math.min(1,(h-field.waterAt(wx,wz))/.5)));
  masks[1]![i]=Math.round(255*road);
  masks[2]![i]=Math.round(255*Math.min(1,Math.max(0,(depth+.25)*2,bed)));
  masks[3]![i]=Math.round(255*stones);
  masks[4]![i]=Math.round(255*Math.max(rock,Math.min(1,Math.max(0,slope-.7))));
 }
 const kinds=[[field.baseMaterial,.25,-1,0],['grass',.25,.5,0],['dirt',.2,.5,0],['waterbed',.05,-1,0],['stones',.4,.25,0],['rock',.16,-1,1]] as const;
 const slots=new Uint8Array(blocks*blocks*16*6);for(let i=0;i<slots.length;i++)slots[i]=i%6;
 return {version:1,source:'authored-layered',sha256:'0'.repeat(64),origin:[origin,origin],sourceOrigin:[origin,origin],blocks:[blocks,blocks],heightSamplesPerUnit:1,maskSamplesPerUnit:1,heightSize:[hw,hw],height:pack(heights),heightOffset:-16,maskSize:[mw,mw],layers:kinds.map(([name,tiling,blend,edge],i)=>({name,...biomeTerrainTile(biome,name),tiling:biomeTerrainTile(biome,name).tiling??tiling,blend:biomeTerrainTile(biome,name).blend??blend,edge,verticality:0,desaturation:0,...(i?{mask:pack(masks[i-1]!)}:{})})),layerSlots:pack(slots),...(field.rockCoverage?{displacement:{mask:pack(masks[4]!),texture:'asset.terrain.woodland-rock-displacement',tiling:.16}}:{}),grass:[],water:[]};
}
