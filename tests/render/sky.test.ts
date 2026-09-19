import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { DAY_CYCLE_SECONDS, Sky } from '../../src/render/sky/sky';

describe('preview day/night clock', () => {
  it('takes 600 seconds for the complete 24-hour loop', () => {
    const sky = new Sky(new Scene());
    expect(DAY_CYCLE_SECONDS).toBe(600);
    sky.setHour(9); sky.setPlaying(true); sky.tick(1000);
    sky.tick(301000); expect(sky.hour).toBeCloseTo(21);
    sky.tick(601000); expect(sky.hour).toBeCloseTo(9);
  });
  it('pauses at the current hour and resumes without counting paused time', () => {
    const sky = new Sky(new Scene());
    sky.setHour(9); sky.setPlaying(true); sky.tick(1000); sky.tick(151000);
    expect(sky.hour).toBeCloseTo(15);
    sky.setPlaying(false); sky.tick(451000); expect(sky.hour).toBeCloseTo(15);
    sky.setPlaying(true); sky.tick(500000); expect(sky.hour).toBeCloseTo(15);
    sky.tick(650000); expect(sky.hour).toBeCloseTo(21);
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
