import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { DAY_CYCLE_SECONDS, Sky } from '../../src/render/sky/sky';

describe('preview day/night clock', () => {
  const day = DAY_CYCLE_SECONDS * 1000, at = (fraction: number) => 1000 + fraction * day;
  it('completes the 24-hour loop in one day cycle', () => {
    const sky = new Sky(new Scene());
    sky.setHour(9); sky.setPlaying(true); sky.tick(1000);
    sky.tick(at(.5)); expect(sky.hour).toBeCloseTo(21);
    sky.tick(at(1)); expect(sky.hour).toBeCloseTo(9);
  });
  it('pauses at the current hour and resumes without counting paused time', () => {
    const sky = new Sky(new Scene());
    sky.setHour(9); sky.setPlaying(true); sky.tick(1000); sky.tick(at(.25));
    expect(sky.hour).toBeCloseTo(15);
    sky.setPlaying(false); sky.tick(at(.75)); expect(sky.hour).toBeCloseTo(15);
    sky.setPlaying(true); sky.tick(at(.8)); expect(sky.hour).toBeCloseTo(15);
    sky.tick(at(1.05)); expect(sky.hour).toBeCloseTo(21);
  });
});

it('retains authored indirect fill in moonlit canopy shade',()=>{
 const sky=new Sky(new Scene());sky.setHour(22);
 const base=sky.lightingDiagnostics();
 sky.setGlobalLight({...base.preset,ambientStrength:3,fillStrength:3});
 const shade=sky.lightingDiagnostics();
 expect(shade.ambientIntensity).toBeCloseTo(base.ambientIntensity*3/base.preset.ambientStrength);
 expect(shade.fillIntensity).toBeCloseTo(base.fillIntensity*3/base.preset.fillStrength);
 expect(shade.sunIntensity).toBeCloseTo(base.sunIntensity);
});
