import {biomeById,biomeTerrainTile} from '../../content/biomes';
import type {HeightField} from '../../shared/map/height';
import {terrainTextureUrl} from './terrainTextureUrl';
const tiles=new Map<string,Promise<Uint8Array>>();
function tile(name:string){
 let result=tiles.get(name);
 if(!result){result=(async()=>{const url=terrainTextureUrl(name);const r=await fetch(url);if(!r.ok||!r.body)throw Error('Ground tint texture unavailable: '+name);return new Uint8Array(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());})();tiles.set(name,result);}
 return result;
}
const cache=new WeakMap<HeightField,Promise<{rgba:Uint8Array;size:number}>>();
/** Unlit material color for the source grass/tree ground-tint input. No baked lighting. */
export function nativeGroundColor(field:HeightField){
 let result=cache.get(field);if(result)return result;
 result=(async()=>{
  const biome=biomeById(field.biome);
  const soilTile=biomeTerrainTile(biome,field.baseMaterial),grassTile=biomeTerrainTile(biome,'grass');
  const [soil,grass]=await Promise.all([tile(soilTile.ar),tile(grassTile.ar)]);
  // Layer paint overrides the base material just as it does in authoredTerrain.
  // Otherwise foliage on a painted meadow inherits orange bare-soil tint.
  const kinds=['soil','grass','dirt','waterbed','stones','rock'] as const;
  const paints=await Promise.all((field.surfacePaint??[]).map(async paint=>{
   const surface=kinds.map(kind=>biomeTerrainTile(biome,kind)).find(t=>t.ar===paint.material);
   return surface?{...paint,pixels:await tile(surface.ar),tiling:surface.tiling??.25}:null;
  }));
  const pixel=(x:number,z:number,tiling:number)=>{const tx=((Math.floor(x*tiling*.08*1024)%1024)+1024)%1024,tz=((Math.floor(z*tiling*.08*1024)%1024)+1024)%1024;return (tz*1024+tx)*4;};
  const size=Math.min(1024,field.verts),rgba=new Uint8Array(size*size*4),span=field.span;
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
   const wx=field.origin+x/(size-1)*span,wz=field.origin+z/(size-1)*span;
   const at=pixel(wx,wz,soilTile.tiling??.25),grassAt=pixel(wx,wz,grassTile.tiling??.25),to=(z*size+x)*4;
   const ix=Math.max(0,Math.min(field.verts-1,Math.round(wx-field.origin))),iz=Math.max(0,Math.min(field.verts-1,Math.round(wz-field.origin)));
   const w=field.grassCoverage?.[iz*field.verts+ix]??0;
   for(let c=0;c<3;c++)rgba[to+c]=Math.round(soil[at+c]!*(1-w)+grass[grassAt+c]!*w);
   for(const paint of paints){
    if(!paint)continue;
    const weight=paint.weights[iz*field.verts+ix]??0;if(weight<=0)continue;
    const from=pixel(wx,wz,paint.tiling);
    for(let c=0;c<3;c++)rgba[to+c]=Math.round(rgba[to+c]!*(1-weight)+paint.pixels[from+c]!*weight);
   }
   rgba[to+3]=255;
  }
  return {rgba,size};
 })();cache.set(field,result);return result;
}
