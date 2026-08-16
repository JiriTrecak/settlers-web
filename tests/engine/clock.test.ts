import { describe, expect, it } from "vitest";
import { Clock } from "../../src/sim/clock";

describe("clock", () => {
  it("tick increments tickIndex", () => {
    const clock = new Clock();
    expect(clock.tickMs).toBe(25);
    expect(clock.tickIndex).toBe(0);
    clock.tick();
    expect(clock.tickIndex).toBe(1);
  });
});
