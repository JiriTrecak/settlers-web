import {expect,it} from 'vitest';
import {DataTexture,RedFormat,FloatType} from 'three';
import {HeightField} from '../../src/shared/map/height';
import {heightChange,rememberHeightChange} from '../../src/shared/map/heightChanges';
import {waterSurface,unchangedWaterTopology} from '../../src/render/water/waterSurface';
import {ImportedWater} from '../../src/render/water/importedWater';
const field=(height:number)=>{const f=new HeightField(32);f.samples.fill(height);return f;};
it('retains exact geometry and flow for dry and submerged edits, including map edges',()=>{
 for(const height of [-4,4])for(const position of [[10,12],[-16,-16],[48,48]]){
  const before=field(height),after=field(height);after.raise(position[0],position[1],3,1);rememberHeightChange(after,before,true);
  expect(unchangedWaterTopology(before,after,heightChange(after,before)!.bounds)).toBe(true);
  const a=waterSurface(before),b=waterSurface(after);expect(b.ground).not.toEqual(a.ground);expect({...b,ground:a.ground}).toEqual(a);
 }
});
it('rejects shore crossings and refreshes the depth texture without mutating old terrain',()=>{
 const before=field(-1),after=field(-1);after.raise(10,10,4,3);rememberHeightChange(after,before,true);
 expect(unchangedWaterTopology(before,after,heightChange(after,before)!.bounds)).toBe(false);
 const water=Object.create(ImportedWater.prototype) as ImportedWater;
 const ground=new DataTexture(before.samples.slice(),before.verts,before.verts,RedFormat,FloatType);
 Object.assign(water,{currentSource:before,ground,groundUploadPending:false});
 expect(water.updateHeight(after)).toBe(false);expect(water.source).toBe(before);expect(ground.updateRanges).toHaveLength(0);
 const lower=field(-1);lower.raise(10,10,4,-2);rememberHeightChange(lower,before,true);
 expect(water.updateHeight(lower)).toBe(true);expect(water.source).toBe(lower);expect(ground.image.data).toEqual(lower.samples);expect(before.samples.every(h=>h===-1)).toBe(true);
 expect(ground.updateRanges.length).toBeGreaterThan(0);expect(ground.updateRanges.reduce((sum,r)=>sum+r.count,0)).toBeLessThan(before.samples.length);
 const changedWater=field(-1);changedWater.waterLevel=1;rememberHeightChange(changedWater,lower,false);
 expect(water.updateHeight(changedWater)).toBe(false);expect(water.updateHeight(field(-3))).toBe(false);
});
it('does not truncate an initial full upload to later partial rows',()=>{
 const before=field(-4),after=field(-4);after.raise(12,10,4,-1);rememberHeightChange(after,before,true);
 const water=Object.create(ImportedWater.prototype) as ImportedWater,ground=new DataTexture(before.samples.slice(),before.verts,before.verts,RedFormat,FloatType);
 Object.assign(water,{currentSource:before,ground,groundUploadPending:true});
 expect(water.updateHeight(after)).toBe(true);expect(ground.updateRanges).toHaveLength(0);expect(ground.image.data).toEqual(after.samples);
});
