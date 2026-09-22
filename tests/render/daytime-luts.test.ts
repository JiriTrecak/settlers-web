import {describe,it,expect} from 'vitest';
import {ClampToEdgeWrapping,LinearFilter,NoColorSpace} from 'three';
import {createDaytimeLuts} from '../../src/render/atmosphere/daytimeLuts';
import {sampleDaytime} from '../../src/shared/environment/dayCycle';

describe('original color-grading volumes',()=>{
 it('creates correctly oriented, monotonic original color curves with linear interpolation',()=>{
  const luts=createDaytimeLuts();
  for(const texture of Object.values(luts.textures)){
   expect(texture.image.width).toBe(32);expect(texture.image.height).toBe(32);expect(texture.image.depth).toBe(32);
   expect(texture.colorSpace).toBe(NoColorSpace);expect(texture.minFilter).toBe(LinearFilter);expect(texture.wrapR).toBe(ClampToEdgeWrapping);
   const d=texture.image.data!,size=32;
   for(let b=0;b<size;b++)for(let g=0;g<size;g++)for(let r=1;r<size;r++){
    const i=((b*size+g)*size+r)*4;expect(d[i]).toBeGreaterThanOrEqual(d[i-4]!);expect(d[i+3]).toBe(255);
   }
   const gray=Array.from(d.slice(((16*32+16)*32+16)*4,((16*32+16)*32+16)*4+3));expect(Math.max(...gray)-Math.min(...gray)).toBeLessThan(24);
  }luts.dispose();
 });
 it('binds both neighboring looks during transitions and one held look on plateaus',()=>{
  const luts=createDaytimeLuts(),dusk=luts.pair(sampleDaytime(17.7)),night=luts.pair(sampleDaytime(23));
  expect(dusk.from).toBe(luts.textures.day);expect(dusk.to).toBe(luts.textures.day_to_night);expect(dusk.blend).toBeCloseTo(.5);
  expect(night.from).toBe(luts.textures.night);expect(night.to).toBe(night.from);expect(night.blend).toBe(0);
  luts.dispose();
 });
});
