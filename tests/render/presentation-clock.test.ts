import {expect, it} from 'vitest';
import {PresentationClock} from '../../src/render/settlement/presentationClock';

it('bounds extrapolation during stalls and catches up to confirmed simulation time', () => {
  const clock = new PresentationClock();
  expect(clock.sample(100, 0, 1).delta).toBe(0);
  expect(clock.sample(100, 10, 1)).toEqual({tick:100.4, delta:expect.closeTo(.01), smoothingDelta:.01});
  expect(clock.sample(100, 100, 1).tick).toBe(100.999);
  const stalled = clock.sample(100, 10_000, 1);
  expect(stalled.delta).toBe(0);
  expect(stalled.smoothingDelta).toBe(.1);
  const caughtUp = clock.sample(120, 10_000, 1);
  expect(caughtUp.tick).toBe(120);
  expect(caughtUp.delta).toBeCloseTo(19.001/40);
});

it('keeps the current pose on pause, supports paused stepping, and resets on rewind', () => {
  const clock = new PresentationClock();
  clock.sample(40,0,1);
  expect(clock.sample(40,10,1).tick).toBe(40.4);
  expect(clock.sample(40,1000,0)).toEqual({tick:40.4,delta:0,smoothingDelta:0});
  expect(clock.sample(41,1000,0).delta).toBeCloseTo(.6/40);
  expect(clock.sample(41,2000,0).delta).toBe(0);
  expect(clock.sample(0,2000,1).delta).toBe(0);
  expect(clock.sample(0,2005,4).tick).toBe(.8);
});

it('produces the same elapsed animation time at regular and uneven frame rates', () => {
  function elapsed(frames: number[]) {
    const clock = new PresentationClock();
    return frames.reduce((sum,now) => sum + clock.sample(Math.floor(now/25),now,1).delta,0);
  }
  expect(elapsed(Array.from({length:201},(_,i)=>i*5))).toBeCloseTo(1);
  expect(elapsed([0,9,33,94,211,540,1000])).toBeCloseTo(1);
});
