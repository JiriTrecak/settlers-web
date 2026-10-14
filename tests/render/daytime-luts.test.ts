import {describe,it,expect} from 'vitest';
import {createDaytimeLuts} from '../../src/render/atmosphere/daytimeLuts';
import {sampleDaytime} from '../../src/shared/environment/dayCycle';

describe('original color-grading volumes',()=>{
 it('creates correctly oriented, opaque, monotonic color curves',()=>{
  const luts=createDaytimeLuts();
  for(const texture of Object.values(luts.textures)){
   const d=texture.image.data!,size=texture.image.width;
   for(let b=0;b<size;b++)for(let g=0;g<size;g++)for(let r=1;r<size;r++){
    const i=((b*size+g)*size+r)*4;expect(d[i]).toBeGreaterThanOrEqual(d[i-4]!);expect(d[i+3]).toBe(255);
   }
  }luts.dispose();
 });
 it('binds both neighboring looks during transitions and one held look on plateaus',()=>{
  const luts=createDaytimeLuts(),dusk=luts.pair(sampleDaytime(18)),night=luts.pair(sampleDaytime(23));
  expect(dusk.from).toBe(luts.textures.day);expect(dusk.to).toBe(luts.textures.night);expect(dusk.blend).toBeCloseTo(.5);
  expect(night.from).toBe(luts.textures.night);expect(night.to).toBe(night.from);expect(night.blend).toBe(0);
  luts.dispose();
 });
});
