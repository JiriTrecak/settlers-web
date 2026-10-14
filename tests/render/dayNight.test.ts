import {describe,expect,it} from 'vitest';
import {clockDisplay} from '../../src/render/minimap/dayNight';

describe('day/night sky dial',()=>{
  it('places the sun overhead at noon and the moon overhead at midnight',()=>{
    const noon=clockDisplay(12),midnight=clockDisplay(0);
    // Overhead = horizontally centred and at the highest point of the orbit.
    const top=Math.min(...Array.from({length:48},(_,i)=>clockDisplay(i/2).sun.y));
    expect(noon.sun.x).toBeCloseTo(midnight.sun.x);expect(noon.sun.y).toBeCloseTo(top);expect(noon.sun.opacity).toBe(1);
    expect(noon.moon.opacity).toBe(0);expect(noon.daylight).toBe(1);
    expect(midnight.moon.x).toBeCloseTo(noon.sun.x);expect(midnight.moon.y).toBeCloseTo(top);
    expect(midnight.moon.opacity).toBe(1);expect(midnight.sun.opacity).toBe(0);expect(midnight.daylight).toBe(0);
  });
  it('crossfades at both horizons without abruptly swapping symbols',()=>{
    for(const hour of [6,18]){
      const before=clockDisplay(hour-.001),at=clockDisplay(hour),after=clockDisplay(hour+.001);
      expect(at.sun.opacity).toBeCloseTo(.5);expect(at.moon.opacity).toBeCloseTo(.5);
      expect(at.twilight).toBeCloseTo(1);
      for(const body of ['sun','moon'] as const){
        expect(Math.abs(before[body].y-after[body].y)).toBeLessThan(.02);
        expect(Math.abs(before[body].opacity-after[body].opacity)).toBeLessThan(.01);
      }
    }
    expect(clockDisplay(5).sun.x).toBeLessThan(clockDisplay(12).sun.x);expect(clockDisplay(19).sun.x).toBeGreaterThan(clockDisplay(12).sun.x);
  });
  it('wraps midnight and invalid input without an orbit jump',()=>{
    expect(clockDisplay(24)).toEqual(clockDisplay(0));
    expect(clockDisplay(-1)).toEqual(clockDisplay(23));
    expect(clockDisplay(NaN)).toEqual(clockDisplay(0));
    expect(Math.abs(clockDisplay(23.999).moon.x-clockDisplay(.001).moon.x)).toBeLessThan(.02);
  });
});
