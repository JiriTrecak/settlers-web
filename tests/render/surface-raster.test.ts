import {expect,it} from 'vitest';
import {HeightField} from '../../src/shared/map/height';
import {sampleSurfaceRaster} from '../../src/render/terrain/surfaceRaster';
import {authoredTerrain} from '../../src/render/terrain/authoredTerrain';

it('retains exact height, water and slope samples at fractional positions and map edges',()=>{
 const field=new HeightField(32);field.samples.set(Float32Array.from(field.samples,(_,i)=>Math.sin(i*.31)*3));
 field.waterAt=(x,z)=>Math.sin(x)+Math.cos(z);
 const xs=Float64Array.from([-40,-16,-.125,0,12.731,32,48,90]),zs=Float64Array.from([-17,-.7,4.36,49]);
 for(const step of [.5,1]){
  const raster=sampleSurfaceRaster(field,xs,zs,step);
  for(let z=0;z<zs.length;z++)for(let x=0;x<xs.length;x++){
   const i=z*xs.length+x,wx=xs[x],wz=zs[z];
   expect(raster.heights[i]).toBe(field.sample(wx,wz));expect(raster.water[i]).toBe(field.waterAt(wx,wz));
   expect(raster.dx[i]).toBe(field.sample(wx+step,wz)-field.sample(wx-step,wz));
   expect(raster.dz[i]).toBe(field.sample(wx,wz+step)-field.sample(wx,wz-step));
  }
 }
});

it('reuses surface samples without changing encoded GPU terrain when vegetation coverage changes',()=>{
 const field=new HeightField(32);field.samples.set(Float32Array.from(field.samples,(_,i)=>Math.sin(i*.31)*3));field.waterLevel=.7;
 const coords=Float64Array.from({length:field.verts},(_,i)=>field.origin+i),surface=sampleSurfaceRaster(field,coords,coords,.5);
 field.grassCoverage=Float32Array.from(field.samples,(_,i)=>i%13/12);
 field.rockCoverage=Float32Array.from(field.samples,(_,i)=>i%7/6);
 const cached=authoredTerrain(field,[],[],surface);
 expect(cached).toEqual(authoredTerrain(field,[],[]));
 field.grassCoverage.fill(.2);field.rockCoverage.fill(.8);
 const changed=authoredTerrain(field,[],[],surface);
 expect(changed).toEqual(authoredTerrain(field,[],[]));
 expect(changed.height).toBe(cached.height);expect(changed.layers).not.toEqual(cached.layers);
});

it('updates local slopes and clamped map edges exactly without resampling unchanged water',async()=>{
 const {rememberHeightChange}=await import('../../src/shared/map/heightChanges');
 const {updateSurfaceRaster}=await import('../../src/render/terrain/surfaceRaster');
 const {vi}=await import('vitest');
 const base=new HeightField(32);base.samples.set(Float32Array.from(base.samples,(_,i)=>Math.sin(i*.31)*3));
 const xs=Float64Array.from([-100,-16,-15.99,-.125,0,4.36,12.731,32,47.99,48,100]),zs=xs;
 for(const step of [.5,1,2]){
  const raster=sampleSurfaceRaster(base,xs,zs,step),snapshot=structuredClone(raster);
  for(const indexes of [[0],[base.samples.length-1],[16*base.verts+16],[25*base.verts+29],[]]){
   const field=new HeightField(32);field.samples.set(base.samples);for(const i of indexes)field.samples[i]+=5;
   const expected=sampleSurfaceRaster(field,xs,zs,step),water=vi.spyOn(field,'waterAt'),height=vi.spyOn(field,'sample');
   rememberHeightChange(field,base,true);const updated=updateSurfaceRaster(raster,field);
   expect(updated).toEqual(expected);expect(water).not.toHaveBeenCalled();
   expect(height.mock.calls.length).toBeLessThan(xs.length*zs.length*5);
   expect(raster).toEqual(snapshot);
   // A no-change update can advance provenance on the same raster. Restore it
   // for the next independent branch of this test.
   updateSurfaceRaster(raster,base,true);
  }
 }
});
it('refreshes water-only changes, tracks repeated revisions, and rejects mutable or unrelated fields',async()=>{
 const {rememberHeightChange}=await import('../../src/shared/map/heightChanges');
 const {updateSurfaceRaster}=await import('../../src/render/terrain/surfaceRaster');
 const xs=Float64Array.from([0,1.5,6.25,20]),base=new HeightField(32),initial=sampleSurfaceRaster(base,xs,xs,.5);
 let previous=base,raster=initial;
 for(const level of [3,1,-2]){
  const field=new HeightField(32);field.samples.set(previous.samples);field.raise(5,5,4,2);field.waterLevel=level;
  rememberHeightChange(field,previous,false);raster=updateSurfaceRaster(raster,field)!;
  expect(raster).toEqual(sampleSurfaceRaster(field,xs,xs,.5));previous=field;
 }
 const waterOnly=new HeightField(32);waterOnly.samples.set(previous.samples);waterOnly.waterLevel=8;
 rememberHeightChange(waterOnly,previous,false);const result=updateSurfaceRaster(raster,waterOnly)!;
 expect(result).toEqual(sampleSurfaceRaster(waterOnly,xs,xs,.5));expect(result.heights).toBe(raster.heights);
 expect(updateSurfaceRaster(initial,new HeightField(32))).toBeUndefined();
 base.raise(4,4,2,5);expect(updateSurfaceRaster(initial,base)).toBeUndefined();
});
