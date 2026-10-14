import {expect,it} from 'vitest';
import {HeightField} from '../../src/shared/map/height';
import {heightChange,rememberHeightChange} from '../../src/shared/map/heightChanges';
import {waterSurface,unchangedWaterTopology} from '../../src/render/water/waterSurface';
const field=(height:number)=>{const f=new HeightField(32);f.samples.fill(height);return f;};
it('retains exact geometry and flow for dry and submerged edits, including map edges',()=>{
 for(const height of [-4,4])for(const position of [[10,12],[-16,-16],[48,48]]){
  const before=field(height),after=field(height);after.raise(position[0],position[1],3,1);rememberHeightChange(after,before,true);
  expect(unchangedWaterTopology(before,after,heightChange(after,before)!.bounds)).toBe(true);
  const a=waterSurface(before),b=waterSurface(after);expect(b.ground).not.toEqual(a.ground);expect({...b,ground:a.ground}).toEqual(a);
 }
});
it('detects edits that cross the shoreline as water topology changes',()=>{
 const before=field(-1),after=field(-1);after.raise(10,10,4,3);rememberHeightChange(after,before,true);
 expect(unchangedWaterTopology(before,after,heightChange(after,before)!.bounds)).toBe(false);
});
