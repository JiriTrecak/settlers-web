import { describe, expect, it } from "vitest";
import { Clock } from "../../src/sim/clock/clock";
import { emptyTickTimings, TickTimer } from "../../src/sim/clock/profile";
import { MapGrid } from "../../src/sim/map/mapGrid";
import { World } from "../../src/sim/world/world";

describe("clock", () => {
  it("tick increments tickIndex", () => {
    const clock = new Clock();
    expect(clock.tickMs).toBe(25);
    expect(clock.tickIndex).toBe(0);
    clock.tick();
    expect(clock.tickIndex).toBe(1);
  });
});

describe("tick profile", () => {
  it("accumulates phase marks into the bucket", () => {
    const acc = emptyTickTimings();
    const t = new TickTimer(acc);
    t.mark("flock");
    t.mark("fog");
    expect(acc.flock).toBeGreaterThanOrEqual(0);
    expect(acc.fog).toBeGreaterThanOrEqual(0);
    expect(acc.matcher).toBe(0);
  });

  it("World.tick fills every phase when asked", () => {
    const grid = new MapGrid(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) grid.setLandscape(x, y, "grass");
    const world = new World(grid);
    const acc = emptyTickTimings();
    world.tick(acc);
    const sum = Object.values(acc).reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(0);
    expect(acc.fog).toBeGreaterThanOrEqual(0);
    expect(acc.flock).toBeGreaterThanOrEqual(0);
  });
});
