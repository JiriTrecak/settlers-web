import type {UtcMap} from '../../src/shared/map/utcmap';
import type {CompiledMapScene} from '../../src/shared/authoring/mapScene';
import {biomeById,biomeTerrainTile} from '../../src/content/biomes';

const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const mix=(a:number[],b:number[],t:number)=>a.map((v,i)=>v+(b[i]!-v)*Math.max(0,Math.min(1,t)));
/** Illustrated strategic atlas: actual elevation, waterways, paint and woodland.
 * No 3D renderer, camera or bitmap textures are needed to publish a preview. */
export function atlasPixels(map:UtcMap,scene:CompiledMapScene,size=512):Uint8Array{
 const field=scene.field,biome=biomeById(map.biome),winter=biome.terrainSet==='winter';
 const soil=rgb(biome.minimap.ground),grass=rgb(biome.minimap.grass),forest=rgb(biome.minimap.forest);
 const colors=new Map((['soil','grass','dirt','waterbed','stones','rock'] as const).map(k=>[biomeTerrainTile(biome,k).ar,k==='grass'?grass:k==='rock'?rgb(winter?'#a4b0bc':'#929080'):k==='stones'?rgb(winter?'#bed0db':'#a79a78'):k==='waterbed'?rgb('#65948d'):k==='dirt'?rgb(winter?'#adc6d8':'#b99a69'):soil]));
 const pixels=new Uint8Array(size*size*4),step=map.size/size;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const wx=(x+.5)*step,wz=(y+.5)*step,h=field.sample(wx,wz),water=field.waterAt(wx,wz);
  const ix=Math.max(0,Math.min(field.verts-1,Math.round(wx-field.origin))),iz=Math.max(0,Math.min(field.verts-1,Math.round(wz-field.origin))),i=iz*field.verts+ix;
  const grain=((Math.imul(x+1,73856093)^Math.imul(y+1,19349663))>>>0)%17/16-.5;
  let c=mix(soil,grass,field.grassCoverage?.[i]??0);
  for(const paint of field.surfacePaint??[]){const color=colors.get(paint.material);if(color)c=mix(c,color,paint.weights[i]??0);}
  c=mix(c,forest,Math.min(.96,(field.forestCoverage?.[i]??0)*1.15));
  const slope=field.sample(wx-step,wz-step)-field.sample(wx+step,wz+step),shade=Math.max(.68,Math.min(1.22,1+slope*.045));
  if(h<water+.04){const depth=Math.max(0,Math.min(1,(water-h)/3));c=mix(rgb(winter?'#9cbdd2':'#80b7ac'),rgb(winter?'#456d92':'#285b74'),depth);}
  else c=c.map(v=>v*shade+grain*9);
  const p=(y*size+x)*4;for(let k=0;k<3;k++)pixels[p+k]=Math.max(0,Math.min(255,Math.round(c[k]!)));pixels[p+3]=255;
 }
 return pixels;
}
/** Stable, readable resource and camp symbols; player selection stays a UI overlay. */
export function atlasSymbols(map:UtcMap,size=512):string{
 const scale=size/map.size,items:string[]=[];
 for(const e of map.entities){
  if(e.definition!=='building.neutral.amber-mine')continue;
  const x=e.position.x*scale,y=e.position.y*scale;
  items.push(`<g transform="translate(${x} ${y})"><circle r="8" fill="#141b17"/><circle cy="-1" r="6" fill="#efb938" stroke="#ffe08b" stroke-width="1.2"/><path d="M-2 -4L2 -5L4 -1L0 3L-3 0Z" fill="#fff0a5"/></g>`);
 }
 for(const camp of map.camps){const x=camp.home.x*scale,y=camp.home.y*scale;items.push(`<g transform="translate(${x} ${y})" stroke="#16201a" stroke-width="2" stroke-linejoin="round"><path d="M-8 6L0 -8L8 6Z" fill="#e3d698"/><path d="M-2 6L0 0L3 6" fill="#513d27"/></g>`);}
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${items.join('')}</svg>`;
}
