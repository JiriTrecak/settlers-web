import { emptyUtcMap } from "../../src/shared/map/utcmap";
import { describe, expect, it } from "vitest";
import {
  HEIGHT_ORIGIN,
  HEIGHT_VERTS,
  HeightField,
  decodeHeight,
  encodeHeight,
  parseUtcMap,
  stringifyUtcMap,
} from "../../src/shared";

describe("height field", () => {
  it("samples bilinear and raises a soft disc", () => {
    const h = new HeightField();
    expect(h.sample(10, 10)).toBe(0);
    const dirty = h.raise(10, 10, 3, 2);
    expect(dirty).not.toBeNull();
    expect(h.sample(10, 10)).toBeGreaterThan(1.5);
    expect(h.sample(10, 10)).toBeLessThanOrEqual(2);
    expect(h.sample(12.5, 10)).toBeGreaterThan(0);
    expect(h.sample(10, 10)).toBeGreaterThan(h.sample(12, 10));
    expect(h.wet(10, 10)).toBe(false);
    h.waterLevel = 4;
    expect(h.wet(10, 10)).toBe(true);
  });

  it("omits a flat encode and roundtrips centimeters", () => {
    const flat = new Float32Array(HEIGHT_VERTS * HEIGHT_VERTS);
    expect(encodeHeight(flat)).toBeUndefined();
    const h = new HeightField();
    h.raise(HEIGHT_ORIGIN + 20, HEIGHT_ORIGIN + 20, 4, 1.23);
    const packed = encodeHeight(h.samples);
    expect(packed).toBeTruthy();
    const back = decodeHeight(packed!);
    expect(back).not.toBeNull();
    expect(back![20 * HEIGHT_VERTS + 20]).toBeCloseTo(
      Math.round(h.samples[20 * HEIGHT_VERTS + 20]! * 100) / 100,
    );
  });

  it("rejects old maps and roundtrips height on current utcmap", () => {
    expect(parseUtcMap({ v: 1 })).toBeNull();
    const h = new HeightField();
    h.raise(8, 8, 2, 1);
    h.waterLevel = -0.5;
    const map = {
      ...emptyUtcMap(),
      name: "Basin",
      stamps: [],
      waterLevel: -0.5,
      height: encodeHeight(h.samples),
    };
    const raw = JSON.parse(stringifyUtcMap(map)) as unknown;
    const next = parseUtcMap(raw);
    expect(next?.name).toBe("Basin");
    expect(next?.waterLevel).toBe(-0.5);
    expect(next?.height).toBeTruthy();
    const decoded = decodeHeight(next!.height!);
    expect(decoded).not.toBeNull();
    const i = (8 - HEIGHT_ORIGIN) * HEIGHT_VERTS + (8 - HEIGHT_ORIGIN);
    expect(decoded![i]).toBeGreaterThan(0.5);
  });

  it("rejects a bad height blob", () => {
    expect(parseUtcMap({ ...emptyUtcMap(), height: "@@@@" })).toBeNull();
    expect(parseUtcMap({ ...emptyUtcMap(), waterLevel: "high" })).toBeNull();
  });
});
