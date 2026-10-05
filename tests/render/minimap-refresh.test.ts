import {expect,it,vi} from 'vitest';
import {Minimap} from '../../src/render/minimap/minimap';
import {HeightField} from '../../src/shared/map/height';
import {sampleSurfaceRaster,type SurfaceRaster} from '../../src/render/terrain/surfaceRaster';
import type {SettlementView} from '../../src/sim/game/observation';
import {decodeBytePatch} from '../../src/shared/snapshots/decodedBytes';
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

it('reuses fog pixels, follows wire receipts and skips unchanged canvas uploads',()=>{
 const createImageData=vi.fn((width:number,height:number)=>({width,height,data:new Uint8ClampedArray(width*height*4)}));
 const putImageData=vi.fn(),ctx={createImageData,putImageData},canvas={width:0,height:0,getContext:()=>ctx};
 const mini=Object.create(Minimap.prototype) as Minimap;
 Object.assign(mini,{fogState:null,fogRevision:-1,fogCanvas:canvas,dirty:false});
 let revision=0;
 const show=(cells?:Uint8Array,owner=0,fogRevision=revision)=>mini.setFog({revision:revision++,fog:cells?{cells,owner,revision:fogRevision}:undefined} as SettlementView);
 show();expect(createImageData).not.toHaveBeenCalled();
 const cells=decodeBytePatch({full:new Uint8Array(64)});show(cells);
 expect(createImageData).toHaveBeenCalledTimes(1);expect(putImageData).toHaveBeenCalledTimes(1);
 const pixels=putImageData.mock.calls[0]![0] as ImageData;
 expect([...pixels.data].filter((_,i)=>i%4===3)).toEqual(Array(64).fill(255));
 putImageData.mockClear();
 decodeBytePatch({changes:new Uint32Array()},cells);show(cells);
 expect(putImageData).not.toHaveBeenCalled();
 // Two updates arrive before a paint. A reverted cell needs no upload.
 decodeBytePatch({changes:new Uint32Array([9*4+2,50*4+1])},cells);
 decodeBytePatch({changes:new Uint32Array([50*4])},cells);show(cells);
 expect(putImageData).toHaveBeenCalledWith(pixels,0,0,1,1,1,1);
 expect(pixels.data[9*4+3]).toBe(0);expect(pixels.data[50*4+3]).toBe(255);
 expect(createImageData).toHaveBeenCalledTimes(1);
 // Owner/load replacement can reuse a revision; it must still refresh.
 putImageData.mockClear();const sameRevision=revision-1;
 show(decodeBytePatch({full:new Uint8Array(64).fill(1)}),0,sameRevision);
 expect(putImageData).toHaveBeenCalledTimes(1);expect(pixels.data[9*4+3]).toBe(166);
 show();show(cells);expect(pixels.data[9*4+3]).toBe(0);
 // A stalled consumer falls back safely, as do untracked direct views.
 for(let i=0;i<17;i++)decodeBytePatch({changes:new Uint32Array([i*4+1])},cells);
 show(cells);for(let i=0;i<17;i++)expect(pixels.data[i*4+3]).toBe(166);
 show(new Uint8Array(64).fill(2),1);expect(pixels.data.every(value=>value===0)).toBe(true);
 show(decodeBytePatch({full:new Uint8Array(256)}));expect(createImageData).toHaveBeenCalledTimes(2);
 expect(canvas.width).toBe(16);expect(canvas.height).toBe(16);
});
