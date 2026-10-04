import './sourceAssetFetch';
import {expect,it} from 'vitest';
import {HeightField} from '../../src/shared/map/height';
import {nativeGroundColor} from '../../src/render/terrain/nativeGroundColor';
import {biomeById,biomeTerrainTile} from '../../src/content/biomes';
import {terrainTilePixels} from '../../src/render/terrain/terrainTilePixels';
import {Color} from 'three';

/** Original direct formula: independent of the sparse index and lookup tables. */
async function directTint(field:HeightField){
 const biome=biomeById(field.biome),base=biomeTerrainTile(biome,field.baseMaterial),grass=biomeTerrainTile(biome,'grass');
 const kinds=['soil','grass','dirt','waterbed','stones','rock'] as const;
 const surfaces=[base,grass,...(field.surfacePaint??[]).map(p=>kinds.map(k=>biomeTerrainTile(biome,k)).find(t=>t.ar===p.material))];
 const textures=await Promise.all(surfaces.map(async s=>s?{pixels:await terrainTilePixels(s.ar),tiling:s.tiling??.25,tint:new Color(s.tint??'#ffffff').toArray()}:null));
 const size=Math.min(1024,field.verts),data=new Uint8Array(size*size*4);
 const sample=(surface:NonNullable<typeof textures[number]>,x:number,z:number,c:number)=>{
  const tx=((Math.floor(x*surface.tiling*.08*1024)%1024)+1024)%1024,tz=((Math.floor(z*surface.tiling*.08*1024)%1024)+1024)%1024;
  const s=surface.pixels[(tz*1024+tx)*4+c]/255,linear=s<=.04045?s/12.92:((s+.055)/1.055)**2.4,value=linear*surface.tint[c];
  return 255*(value<=.0031308?value*12.92:1.055*value**(1/2.4)-.055);
 };
 for(let z=0;z<size;z++)for(let x=0;x<size;x++){
  const wx=field.origin+x/(size-1)*field.span,wz=field.origin+z/(size-1)*field.span;
  const ix=Math.max(0,Math.min(field.verts-1,Math.round(wx-field.origin))),iz=Math.max(0,Math.min(field.verts-1,Math.round(wz-field.origin))),at=iz*field.verts+ix,to=(z*size+x)*4,w=field.grassCoverage?.[at]??0;
  for(let c=0;c<3;c++)data[to+c]=Math.round(sample(textures[0]!,wx,wz,c)*(1-w)+sample(textures[1]!,wx,wz,c)*w);
  for(let i=0;i<(field.surfacePaint?.length??0);i++){
   const texture=textures[i+2],weight=field.surfacePaint![i].weights[at]??0;if(!texture||weight<=0)continue;
   for(let c=0;c<3;c++)data[to+c]=Math.round(data[to+c]*(1-weight)+sample(texture,wx,wz,c)*weight);
  }
  data[to+3]=255;
 }
 return data;
}

it.each(['vibrant-forest','frozen-forest','autumn-forest'])('matches ordered direct tinting byte-for-byte in %s',async biome=>{
 const field=new HeightField(32);field.biome=biome;
 field.grassCoverage=Float32Array.from(field.samples,(_,i)=>(i*37%101)/100);
 const kinds=['rock','grass','stones','soil','waterbed','dirt','grass'] as const;
 field.surfacePaint=kinds.map((kind,j)=>({owner:String(j),material:biomeTerrainTile(biomeById(biome),kind).ar,weights:Float32Array.from(field.samples,(_,i)=>(i+j)%3===0?0:((i*17+j*13)%101)/100)}));
 field.surfacePaint.splice(2,0,{owner:'unsupported',material:'not-a-biome-material',weights:new Float32Array(field.samples.length).fill(1)});
 const expected=await directTint(field),actual=await nativeGroundColor(field);
 expect(Buffer.from(actual.rgba).equals(Buffer.from(expected))).toBe(true);
});
it('tints foliage with the painted meadow and restores bare soil in erased regions',async()=>{
 const base=new HeightField(16),painted=new HeightField(16),grass=new HeightField(16);
 grass.grassCoverage=new Float32Array(grass.verts**2).fill(1);
 const weights=new Float32Array(painted.verts**2).fill(1);weights[0]=0;weights[1]=.5;
 painted.surfacePaint=[{owner:'meadow',material:biomeTerrainTile(biomeById(painted.biome),'grass').ar,weights}];
 const [soilResult,paintResult,grassResult]=await Promise.all([base,painted,grass].map(nativeGroundColor));
 expect(Array.from(paintResult.rgba.slice(0,3))).toEqual(Array.from(soilResult.rgba.slice(0,3)));
 expect(Array.from(paintResult.rgba.slice(8,11))).toEqual(Array.from(grassResult.rgba.slice(8,11)));
 for(let c=0;c<3;c++)expect(paintResult.rgba[4+c]).toBe(Math.round((soilResult.rgba[4+c]!+grassResult.rgba[4+c]!)/2));
 expect(Array.from(paintResult.rgba.slice(8,11))).not.toEqual(Array.from(soilResult.rgba.slice(8,11)));
});
