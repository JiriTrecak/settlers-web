import {expect,it} from 'vitest';
import {Minimap} from '../../src/render/minimap/minimap';
import {HeightField} from '../../src/shared/map/height';
import {sampleSurfaceRaster,type SurfaceRaster} from '../../src/render/terrain/surfaceRaster';
// Exercise cache invalidation without requiring a browser canvas implementation.
type State={height:HeightField|null;surfaceRaster?:SurfaceRaster;terrainDirty:boolean;dirty:boolean};
it('invalidates mutable sculpt edits and retains verified surface data for material-only edits',()=>{
 const field=new HeightField(16),raster=sampleSurfaceRaster(field,new Float64Array([1]),new Float64Array([1]),1);
 const mini=Object.create(Minimap.prototype) as Minimap,state=mini as unknown as State;
 Object.assign(state,{height:field,surfaceRaster:raster,terrainDirty:false,dirty:false});
 mini.setHeight(field,true);expect(state.terrainDirty).toBe(false);expect(state.surfaceRaster).toBe(raster);
 const coverage=new HeightField(16);coverage.grassCoverage=new Float32Array(coverage.samples.length).fill(1);
 mini.setHeight(coverage,true);expect(state.terrainDirty).toBe(true);expect(state.surfaceRaster).toBe(raster);
 state.terrainDirty=false;state.dirty=false;coverage.raise(1,1,2,4);
 mini.setHeight(coverage);expect(state.terrainDirty).toBe(true);expect(state.surfaceRaster).toBeUndefined();
 state.surfaceRaster=raster;mini.setHeight(new HeightField(32),true);expect(state.surfaceRaster).toBeUndefined();
});
