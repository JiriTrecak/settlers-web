import {describe,it,expect} from 'vitest';
import {Scene,Vector3,Color} from 'three';
import {DAYTIME_LOOKS,DAY_PHASES,sampleDaytime,daytimeLabel,daytimeDirection} from '../../src/shared/environment/dayCycle';
import {Sky} from '../../src/render/sky/sky';
import {HEARTWOOD_INTERIOR} from '../../src/shared/environment/presets';

describe('two-palette cycle with continuously moving shadows',()=>{
 it('holds colors on plateaus, including midnight, but blends directly at dawn and dusk',()=>{
  const {dawnStart,dawnEnd,duskStart,duskEnd}=DAY_PHASES;
  for(const h of [dawnEnd+.01,11,14,duskStart-.01])expect(sampleDaytime(h).look).toBe(DAYTIME_LOOKS.day);
  for(const h of [duskEnd+.01,21,23.9,0,3,dawnStart-.01,-1,25])expect(sampleDaytime(h).look).toBe(DAYTIME_LOOKS.night);
  for(const h of [(dawnStart+dawnEnd)/2,(duskStart+duskEnd)/2]){
   const s=sampleDaytime(h);expect(s.blend).toBeCloseTo(.5);
   expect(s.look.sunColor.multiplier).toBeCloseTo((DAYTIME_LOOKS.day.sunColor.multiplier+DAYTIME_LOOKS.night.sunColor.multiplier)/2);
   expect(s.lutWeights.reduce((sum,l)=>sum+l.weight,0)).toBeCloseTo(1);
  }
  expect(daytimeLabel(12)).toBe('Day');expect(daytimeLabel((duskStart+duskEnd)/2)).toBe('Dusk');
 });
 it('transitions without jumps in colors or light direction',()=>{
  for(const h of [0,DAY_PHASES.dawnStart,6,DAY_PHASES.dawnEnd,DAY_PHASES.duskStart,18,DAY_PHASES.duskEnd,24]){
   const a=sampleDaytime(h-1e-7).look,b=sampleDaytime(h+1e-7).look;
   expect(a.sunColor.multiplier).toBeCloseTo(b.sunColor.multiplier,5);
   for(let i=0;i<3;i++)expect(a.sunColor.rgb[i]).toBeCloseTo(b.sunColor.rgb[i],3);
   expect(new Vector3(...daytimeDirection(h-1e-7)).distanceTo(new Vector3(...daytimeDirection(h+1e-7)))).toBeLessThan(1e-6);
  }
 });
 it('moves actual shadow light during held palettes and keeps it above the horizon',()=>{
  const sky=new Sky(new Scene());
  for(const hour of [9,13,21,1]){
   sky.setHour(hour);const position=sky.sun.position.clone(),color=sky.sun.color.clone(),intensity=sky.sun.intensity;
   sky.setHour(hour+.1);
   expect(sky.sun.position.distanceTo(position)).toBeGreaterThan(.1);
   expect(sky.sun.position.y).toBeGreaterThan(sky.sun.target.position.y);
   expect(sky.sun.color.equals(color)).toBe(true);expect(sky.sun.intensity).toBe(intensity);
  }
  sky.setHour(0);const midnight=sky.sun.position.clone();sky.setHour(24);expect(sky.sun.position.distanceTo(midnight)).toBeLessThan(1e-9);
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
