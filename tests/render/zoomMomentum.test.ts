import { expect, it } from "vitest";
import { ZoomMomentum } from "../../src/render/input/zoomMomentum";
it("continues after wheel input, slows down, and settles equally at 60 and 120 Hz", () => {
  const results = [60, 120].map(hz => {
    const zoom = new ZoomMomentum(); zoom.push(100);
    let total = 1, previous = Infinity;
    for (let frame = 0; frame < hz * 2; frame++) {
      const factor = zoom.step(1000 / hz);
      expect(factor).toBeLessThanOrEqual(previous + 0.00002);
      expect(factor).toBeGreaterThanOrEqual(1);
      total *= factor; previous = factor;
    }
    expect(zoom.step(16)).toBe(1);
    return total;
  });
  expect(results[0]).toBeCloseTo(Math.exp(.04), 8);
  expect(results[1]).toBeCloseTo(results[0], 8);
});
it("reverses promptly and clears momentum on reset", () => {
  const zoom = new ZoomMomentum(); zoom.push(100); zoom.step(16);
  zoom.push(-100);
  expect(zoom.step(16)).toBeLessThan(1);
  zoom.reset(); expect(zoom.step(16)).toBe(1);
});
