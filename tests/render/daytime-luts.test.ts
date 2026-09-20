import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {ClampToEdgeWrapping,LinearFilter,NoColorSpace} from 'three';
import {createDaytimeLuts} from '../../src/render/atmosphere/daytimeLuts';
import {sampleDaytime} from '../../src/shared/environment/dayCycle';
import source from '../../assets/library/asset.unregistered.textures.grading.scouring-reference-luts.json/data.json';

describe('reference color-grading volumes',()=>{
 it('preserves every source DDS texel and its RGB axes without a gamma conversion',()=>{
  const luts=createDaytimeLuts();
  for(const [id,texture] of Object.entries(luts.textures)){
   const dds=readFileSync(`art/references/daytimes/env_lut_${id}__vol_uncmp.dds`);
   expect(createHash('sha256').update(dds).digest('hex')).toBe(source[id as keyof typeof source].sourceSHA256);
   expect(dds.toString('ascii',0,4)).toBe('DDS ');
   expect([dds.readUInt32LE(12),dds.readUInt32LE(16),dds.readUInt32LE(24)]).toEqual([16,16,16]);
   expect(texture.colorSpace).toBe(NoColorSpace);expect(texture.minFilter).toBe(LinearFilter);
   expect(texture.wrapR).toBe(ClampToEdgeWrapping);expect(texture.flipY).toBe(false);
   const rgba=texture.image.data!;
   for(let i=0;i<16**3;i++){
    expect(Array.from(rgba.slice(i*4,i*4+4))).toEqual([dds[128+i*4+2],dds[128+i*4+1],dds[128+i*4],255]);
   }
  }
  luts.dispose();
 });
 it('binds both neighboring looks during transitions and one held look on plateaus',()=>{
  const luts=createDaytimeLuts(),dusk=luts.pair(sampleDaytime(17.7)),night=luts.pair(sampleDaytime(23));
  expect(dusk.from).toBe(luts.textures.day);expect(dusk.to).toBe(luts.textures.day_to_night);expect(dusk.blend).toBeCloseTo(.5);
  expect(night.from).toBe(luts.textures.night);expect(night.to).toBe(night.from);expect(night.blend).toBe(0);
  luts.dispose();
 });
});
