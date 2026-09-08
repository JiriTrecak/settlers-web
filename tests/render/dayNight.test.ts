import { describe, expect, it } from 'vitest';
import { clockDisplay } from '../../src/render/minimap/dayNight';

describe('minimap clock', () => {
  it('formats time, wraps midnight and switches sun/moon at dawn and dusk', () => {
    expect(clockDisplay(9.5)).toEqual({time:'09:30',day:true,progress:9.5/24});
    expect(clockDisplay(24)).toEqual({time:'00:00',day:false,progress:0});
    expect(clockDisplay(10.8).time).toBe('10:48');
    expect(clockDisplay(-1).time).toBe('23:00');
    expect(clockDisplay(5.99).day).toBe(false);
    expect(clockDisplay(6).day).toBe(true);
    expect(clockDisplay(18).day).toBe(false);
  });
});
