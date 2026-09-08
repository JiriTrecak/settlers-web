import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { DAY_CYCLE_SECONDS, Sky } from '../../src/render/sky/sky';

describe('preview day/night clock', () => {
  it('takes 240 seconds for the complete 24-hour loop', () => {
    const sky = new Sky(new Scene());
    expect(DAY_CYCLE_SECONDS).toBe(240);
    sky.setHour(9); sky.setPlaying(true); sky.tick(1000);
    sky.tick(121000); expect(sky.hour).toBeCloseTo(21);
    sky.tick(241000); expect(sky.hour).toBeCloseTo(9);
  });
  it('pauses at the current hour and resumes without counting paused time', () => {
    const sky = new Sky(new Scene());
    sky.setHour(9); sky.setPlaying(true); sky.tick(1000); sky.tick(61000);
    expect(sky.hour).toBeCloseTo(15);
    sky.setPlaying(false); sky.tick(181000); expect(sky.hour).toBeCloseTo(15);
    sky.setPlaying(true); sky.tick(200000); expect(sky.hour).toBeCloseTo(15);
    sky.tick(260000); expect(sky.hour).toBeCloseTo(21);
  });
});
