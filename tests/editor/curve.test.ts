import { emptyUtcMap } from "../../src/shared/map/utcmap";
import { describe, it, expect } from "vitest";
import {
  sampleCurve,
  curveDistance,
  emptyLandscape,
  parseLandscape,
} from "../../src/shared/landscape/curve";
import { parseUtcMap, stringifyUtcMap } from "../../src/shared/map/utcmap";
describe("landscape curve strokes", () => {
  it("interpolates endpoints and variable widths without depending on input event rate", () => {
    const c = sampleCurve(
      [
        { x: 0, z: 0, radius: 2 },
        { x: 10, z: 0, radius: 6 },
      ],
      4,
    );
    expect(c[0]).toEqual({ x: 0, z: 0, radius: 2 });
    expect(c.at(-1)).toEqual({ x: 10, z: 0, radius: 6 });
    expect(curveDistance(5, 0, c)).toBe(0);
    expect(curveDistance(10, 3, c)).toBeCloseTo(0.5);
  });
  it("handles repeated points and a single dab with finite samples", () => {
    const c = sampleCurve(
      [
        { x: 4, z: 5 },
        { x: 4, z: 5 },
        { x: 10, z: 8 },
      ],
      3,
    );
    expect(c.every((p) => Number.isFinite(p.x + p.z + p.radius))).toBe(true);
    expect(curveDistance(4, 8, sampleCurve([{ x: 4, z: 5 }], 3))).toBe(1);
  });
  it("roundtrips painted layers, meadow seeds and environment alongside legacy map data", () => {
    const landscape = emptyLandscape();
    landscape.strokes.push({
      points: [
        { x: 12, z: 24, radius: 3 },
        { x: 20, z: 30, radius: 8 },
      ],
      radius: 4,
      layer: "sand",
      opacity: 0.7,
    });
    landscape.cover.push({
      x: 20,
      z: 22,
      radius: 12,
      density: 3,
      flowers: 0.2,
      seed: 42,
      palette: "ochre",
    });
    landscape.environment = { hour: 22, season: "autumn", playing: true };
    landscape.rivers = [
      {
        points: [
          { x: 10, z: 15, radius: 2 },
          { x: 20, z: 30, radius: 5 },
        ],
        radius: 4,
        depth: 1.8,
      },
    ];
    const map = {
      ...emptyUtcMap(),
      name: "River",
      stamps: [
        {
          id: "snow-tree",
          asset: "pine",
          x: 12,
          y: 22,
          elevation: 2,
          variant: "snow" as const,
        },
      ],
      landscape,
    };
    expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))).toEqual(map);
    expect(
      parseUtcMap({ ...emptyUtcMap(), name: "Legacy", stamps: [] }),
    ).toEqual({ ...emptyUtcMap(), name: "Legacy", stamps: [] });
  });
  it("rejects corrupt persisted geometry and settings", () => {
    expect(
      parseLandscape({ ...emptyLandscape(), strokes: [null] }),
    ).toBeUndefined();
    expect(
      parseLandscape({ ...emptyLandscape(), cover: [null] }),
    ).toBeUndefined();
    const l = emptyLandscape();
    l.strokes.push({
      points: [{ x: NaN, z: 0 }],
      radius: 4,
      layer: "sand",
      opacity: 1,
    });
    expect(parseLandscape(l)).toBeUndefined();
    expect(
      parseLandscape({
        ...emptyLandscape(),
        environment: { hour: NaN, season: "summer", playing: false },
      }),
    ).toBeUndefined();
  });
});
