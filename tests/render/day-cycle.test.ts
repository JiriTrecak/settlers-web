import {describe,it,expect} from 'vitest';
import {Scene,Vector3,Color} from 'three';
import {DAYTIME_LOOKS,DAY_PHASES,sampleDaytime,daytimeLabel} from '../../src/shared/environment/dayCycle';
import {Sky} from '../../src/render/sky/sky';
import {HEARTWOOD_INTERIOR} from '../../src/shared/environment/presets';

describe('authored four-state cycle',()=>{
 it('uses the authored palette and HDR multipliers',()=>{
  const day=DAYTIME_LOOKS.day,night=DAYTIME_LOOKS.night;
  expect(day.ambient).toEqual({rgb:[230,230,230],alpha:1,multiplier:4});
  expect(day.sunColor).toEqual({rgb:[247,209,128],alpha:1,multiplier:16});
  expect(night.ambient.rgb).toEqual([132,167,255]);expect(night.sunColor.multiplier).toBe(4);
  expect(DAYTIME_LOOKS.day_to_night.sunColor.multiplier).toBe(18);
  expect(DAYTIME_LOOKS.night_to_day.sunColor.multiplier).toBe(22);
  for(const look of Object.values(DAYTIME_LOOKS)){
   expect(look.fog.density).toBeGreaterThanOrEqual(0);expect(Number.isFinite(look.fog.startHeight)).toBe(true);
   expect(look.textureColorLUT).toMatch(/^woodland-/);
  }
 });
 it('holds all attributes constant throughout day and night, including wraparound',()=>{
  for(const h of [6.6,8,11,14,17.4])expect(sampleDaytime(h).look).toBe(DAYTIME_LOOKS.day);
  for(const h of [18.6,21,23.9,0,3,5.4,-1,25])expect(sampleDaytime(h).look).toBe(DAYTIME_LOOKS.night);
  expect(sampleDaytime(6).look).toBe(DAYTIME_LOOKS.night_to_day);
  expect(sampleDaytime(18).look).toBe(DAYTIME_LOOKS.day_to_night);
 });
 it('uses 30-second transitions and 270-second plateaus in a ten-minute loop',()=>{
  expect((DAY_PHASES.dawnEnd-DAY_PHASES.dawnStart)/24*600).toBeCloseTo(30);
  expect((DAY_PHASES.duskEnd-DAY_PHASES.duskStart)/24*600).toBeCloseTo(30);
  expect((DAY_PHASES.duskStart-DAY_PHASES.dawnEnd)/24*600).toBeCloseTo(270);
 });
 it('interpolates every numeric attribute continuously and keeps both LUT references',()=>{
  for(const peak of [6,18])for(const h of [peak-.6,peak,peak+.6]){
   const before=sampleDaytime(h-1e-7).look,after=sampleDaytime(h+1e-7).look;
   expect(before.sunColor.multiplier).toBeCloseTo(after.sunColor.multiplier,5);
   expect(before.fog.startHeight).toBeCloseTo(after.fog.startHeight,5);
   for(let i=0;i<3;i++)expect(before.sunDirection[i]).toBeCloseTo(after.sunDirection[i],5);
  }
  const sample=sampleDaytime(17.7);
  expect(sample.blend).toBeCloseTo(.5);expect(sample.look.sunColor.multiplier).toBeCloseTo(17);
  expect(sample.lutWeights.reduce((s,l)=>s+l.weight,0)).toBeCloseTo(1);
  expect(sample.look.colorize.radialFactorScale).toBe(1);
  expect(sampleDaytime(18.3).look.colorize.radialFactorScale).toBeCloseTo(1.5);
  expect(daytimeLabel(8)).toBe('Day');expect(daytimeLabel(18)).toBe('Dusk');
 });
 it('applies literal source light values without multiplying by the retired solar curve',()=>{
  const sky=new Sky(new Scene());sky.setHour(12);
  expect(sky.sun.intensity).toBe(16);expect(sky.sun.color.getHexString()).toBe('f7d180');
  expect(sky.lightingDiagnostics().ambientIntensity).toBe(4);
  const direction=sky.sun.target.position.clone().sub(sky.sun.position).normalize();
  expect(direction.distanceTo(new Vector3(.5,-1,-.5).normalize())).toBeLessThan(1e-8);
  sky.setHour(22);expect(sky.sun.intensity).toBe(4);expect(sky.sun.color.getHexString()).toBe('86b9f8');
  sky.setHour(18);expect(sky.sun.intensity).toBe(18);
 });
 it('keeps interior lighting independent of the outside clock',()=>{
  const sky=new Sky(new Scene());sky.setGlobalLight(HEARTWOOD_INTERIOR.light);sky.setInterior(true);
  sky.setHour(12);const color=sky.sun.color.clone(),intensity=sky.sun.intensity;
  sky.setHour(0);expect(sky.sun.color.equals(color)).toBe(true);expect(sky.sun.intensity).toBe(intensity);
  expect(color.equals(new Color(HEARTWOOD_INTERIOR.light.sunTint))).toBe(true);expect(sky.daytime()).toBeUndefined();
 });
 it('handles a zero timestamp and does not accumulate paused elapsed time',()=>{
  const sky=new Sky(new Scene());sky.setHour(0);sky.setPlaying(true);sky.tick(0);sky.tick(25000);expect(sky.hour).toBe(1);
  sky.setPlaying(false);sky.tick(50000);expect(sky.hour).toBe(1);
 });
});
