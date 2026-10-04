import {expect,it} from 'vitest';
import {terrainPixel} from '../../src/render/minimap/terrainStyle';
import {rasterTerrainLighting} from '../../src/render/minimap/terrainRaster';
import type {SurfaceRaster} from '../../src/render/terrain/surfaceRaster';

it('keeps every terrain and water byte identical across cached coverage edits',()=>{
 const width=43,count=width*29;
 const surface:SurfaceRaster={heights:Float64Array.from({length:count},(_,i)=>i%31/3-4),water:Float64Array.from({length:count},(_,i)=>i%17/8),dx:Float64Array.from({length:count},(_,i)=>Math.sin(i)*4),dz:Float64Array.from({length:count},(_,i)=>Math.cos(i)*4)};
 for(let edit=0;edit<3;edit++){
  const original=Uint8ClampedArray.from({length:count*4},(_,i)=>(i*17+edit*83)%256),actual=original.slice(),expected=original.slice();
  for(let i=0;i<count;i++){
   const rgb=terrainPixel([original[i*4],original[i*4+1],original[i*4+2]],surface.heights[i],surface.water[i],surface.dx[i],surface.dz[i],i%width,Math.floor(i/width));
   expected.set(rgb,i*4);
  }
  rasterTerrainLighting(actual,surface,width);expect(actual).toEqual(expected);
 }
});
