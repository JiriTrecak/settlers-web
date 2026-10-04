import {Color} from 'three';
import {indexedPaints} from '../../shared/authoring/sparseWeights';
import {perf} from '../../debug/performance';
import {biomeById,biomeTerrainTile} from '../../content/biomes';
import type {HeightField} from '../../shared/map/height';
import {terrainTilePixels as tile} from './terrainTilePixels';
const cache=new WeakMap<HeightField,Promise<{rgba:Uint8Array;size:number}>>();
/** Unlit material color for the source grass/tree ground-tint input. No baked lighting. */
export function nativeGroundColor(field:HeightField){
 let result=cache.get(field);if(result)return result;
 result=(async()=>{
  const biome=biomeById(field.biome);
  const soilTile=biomeTerrainTile(biome,field.baseMaterial),grassTile=biomeTerrainTile(biome,'grass');
  const soilTint=new Color(soilTile.tint??'#ffffff').toArray(),grassTint=new Color(grassTile.tint??'#ffffff').toArray();
  // Layer paint overrides the base material just as it does in authoredTerrain.
  // Otherwise foliage on a painted meadow inherits orange bare-soil tint.
  const kinds=['soil','grass','dirt','waterbed','stones','rock'] as const;
  const sourcePaints=field.surfacePaint??[];
  const paintsReady=Promise.all(sourcePaints.map(async paint=>{
   const surface=kinds.map(kind=>biomeTerrainTile(biome,kind)).find(t=>t.ar===paint.material);
   return surface?{...paint,pixels:await tile(surface.ar),tiling:surface.tiling??.25,tint:new Color(surface.tint??'#ffffff').toArray()}:null;
  }));
  const [[soil,grass],paints]=await Promise.all([Promise.all([tile(soilTile.ar),tile(grassTile.ar)]),paintsReady]);
  const started=perf.start();
  const tinted=(v:number,t:number)=>{const s=v/255,l=s<=.04045?s/12.92:((s+.055)/1.055)**2.4,x=l*t;return 255*(x<=.0031308?x*12.92:1.055*x**(1/2.4)-.055);};
  // Preserve double-precision tint arithmetic and byte rounding exactly, but
  // calculate the 256 possible input values once instead of per texel/channel.
  const tables=new Map<number,Float64Array>();
  const table=(t:number)=>{let found=tables.get(t);if(!found){found=Float64Array.from({length:256},(_,v)=>tinted(v,t));tables.set(t,found);}return found;};
  const size=Math.min(1024,field.verts),rgba=new Uint8Array(size*size*4),span=field.span;
  const coordinates=Float64Array.from({length:size},(_,i)=>field.origin+i/(size-1)*span);
  const vertices=Int32Array.from(coordinates,v=>Math.max(0,Math.min(field.verts-1,Math.round(v-field.origin))));
  const textureCoordinates=new Map<number,Int32Array>();
  const textureAxis=(tiling:number)=>{let axis=textureCoordinates.get(tiling);if(!axis){axis=Int32Array.from(coordinates,v=>((Math.floor(v*tiling*.08*1024)%1024)+1024)%1024);textureCoordinates.set(tiling,axis);}return axis;};
  const soilAxis=textureAxis(soilTile.tiling??.25),grassAxis=textureAxis(grassTile.tiling??.25);
  const soilColors=soilTint.map(table),grassColors=grassTint.map(table);
  const layers=paints.map(paint=>paint?{...paint,axis:textureAxis(paint.tiling),colors:paint.tint.map(table)}:null);
  const index=indexedPaints(sourcePaints,field.samples.length);
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
   const at=(soilAxis[z]!*1024+soilAxis[x]!)*4,grassAt=(grassAxis[z]!*1024+grassAxis[x]!)*4,to=(z*size+x)*4;
   const vertex=vertices[z]!*field.verts+vertices[x]!,w=field.grassCoverage?.[vertex]??0;
   for(let c=0;c<3;c++)rgba[to+c]=Math.round(soilColors[c]![soil[at+c]!]!*(1-w)+grassColors[c]![grass[grassAt+c]!]!*w);
   for(let j=index.offsets[vertex]!;j<index.offsets[vertex+1]!;j++){
    const paint=layers[index.layers[j]!]!;if(!paint)continue;
    const weight=paint.weights[vertex]??0;if(weight<=0)continue;
    const from=(paint.axis[z]!*1024+paint.axis[x]!)*4;
    for(let c=0;c<3;c++)rgba[to+c]=Math.round(rgba[to+c]!*(1-weight)+paint.colors[c]![paint.pixels[from+c]!]!*weight);
   }
   rgba[to+3]=255;
  }
  perf.end('Foliage · ground tint bake (event)',started);
  return {rgba,size};
 })();cache.set(field,result);void result.catch(()=>{if(cache.get(field)===result)cache.delete(field);});return result;
}
