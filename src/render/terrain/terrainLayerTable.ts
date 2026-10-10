import type {TerrainTexturePalette} from './terrainTexturePalette';
import {Color} from 'three';
import {groundTextures} from '../../shared/authoring/groundTextures';
import {unpackSourceBytes,type ImportedTerrain} from '../../shared/map/importedTerrain';

/** GPU-only lookup: subblock slots followed by eight RGBA texels per material.
 * Sharing the existing slot sampler keeps texture-unit usage constant. Float
 * storage preserves linear tints, fractional blend settings, and atlas indices. */
export function terrainLayerTable(source:ImportedTerrain,palette?:TerrainTexturePalette){
 const width=source.blocks[0]*8,slotRows=source.blocks[1]*4,metadataOffset=width*slotRows;
 const height=slotRows+Math.ceil(source.layers.length*8/width),data=new Float32Array(width*height*4);
 data.fill(255,0,metadataOffset*4);
 const raw=unpackSourceBytes(source.layerSlots);
 for(let bz=0;bz<source.blocks[1];bz++)for(let bx=0;bx<source.blocks[0];bx++)for(let j=0;j<16;j++){
  const from=((bz*source.blocks[0]+bx)*16+j)*6,to=((bz*4+Math.floor(j/4))*width+bx*8+j%4*2)*4;
  data.set(raw.subarray(from,from+6),to);
 }
 source.layers.forEach((layer,i)=>{
  const g=groundTextures.get(layer.ar)?.terrain,at=(metadataOffset+i*8)*4;
  const tint=new Color(layer.tint??'#ffffff').multiplyScalar(g?.reflectance??1);
  data.set([layer.tiling,layer.blend,layer.verticality,layer.edge],at);
  data.set([tint.r,tint.g,tint.b,layer.desaturation],at+4);
  if(g)data.set(g.projection?[-1,g.projection.verticalWorldSize,g.tileWorldSize,0]:[g.atlas.columns,g.atlas.rows,g.tileWorldSize,g.atlas.fullTiles[0]],at+8);
  data[at+12]=layer.breakup??0;
  data.set(palette?.indices[i]??[i,i,i],at+13);
  for(let c=0;c<16;c++)data[at+16+c]=g?.atlas.corners?.[c]??0;
  if(g?.projection)data.set([g.projection.startSlope,g.projection.fullSlope],at+16);
 });
 return {data,width,height,metadataOffset};
}
