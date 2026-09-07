import { describe,it,expect } from 'vitest';
import { HeightField } from '../../src/shared/map/height';
import { applyLandform, type Landform } from '../../src/shared/landscape/landform';
const hill:Landform={x:128,z:128,radiusX:12,radiusZ:6,height:4,rotation:0,plateau:.5,roughness:0,seed:42};
describe('authored landforms',()=>{
 it('keeps a level crown, softly joins the untouched terrain, and rotates its footprint',()=>{
  const f=new HeightField();f.samples.fill(1);applyLandform(f,hill);
  expect(f.sample(128,128)).toBe(5);expect(f.sample(133,128)).toBe(5);
  expect(f.sample(139,128)).toBeGreaterThan(1);expect(f.sample(140,128)).toBe(1);
  expect(f.sample(128,135)).toBe(1);
  const rotated=new HeightField();rotated.samples.fill(1);applyLandform(rotated,{...hill,rotation:Math.PI/2});
  expect(rotated.sample(128,137)).toBeCloseTo(f.sample(137,128));
 });
 it('creates a repeatable irregular basin without changing water level or distant terrain',()=>{
  const a=new HeightField(),b=new HeightField();a.waterLevel=b.waterLevel=2;
  const basin={...hill,height:-3,roughness:.2};applyLandform(a,basin);applyLandform(b,basin);
  expect(a.samples).toEqual(b.samples);expect(a.sample(128,128)).toBe(-3);
  expect(a.waterLevel).toBe(2);expect(a.sample(90,90)).toBe(0);
 });
});
