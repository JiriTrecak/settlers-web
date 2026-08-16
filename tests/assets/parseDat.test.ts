import { describe, expect, it } from "vitest";
import { packLandscapeAtlas, TEXTURE_GRID, TEXTURE_POSITIONS, TEXTURE_SIZE } from "../../src/assets/dat/atlas";
import { buildDat } from "../../src/assets/dat/buildDat";
import { packRgb565, rgb565ToRgba } from "../../src/assets/dat/color";
import { compositeSettler } from "../../src/assets/dat/composite";
import { parseDat, parseDatFileName } from "../../src/assets/dat/parseDat";

describe("parseDatFileName", () => {
  it("reads gold 565 and amazon 555", () => {
    expect(parseDatFileName("siedler3_10.f8007e01f.dat")).toEqual({ fileIndex: 10, color: "rgb565" });
    expect(parseDatFileName("GFX/siedler3_00.7c003e01f.dat")).toEqual({ fileIndex: 0, color: "rgb555" });
    expect(parseDatFileName("readme.txt")).toBeNull();
  });
});

describe("color", () => {
  it("matches Java convert565to8888 channels", () => {
    expect(rgb565ToRgba(0xf800)).toEqual([255, 0, 0, 255]);
    expect(rgb565ToRgba(0x07e0)).toEqual([0, 255, 0, 255]);
    expect(rgb565ToRgba(0x001f)).toEqual([0, 0, 255, 255]);
    expect(packRgb565(255, 0, 0)).toBe(0xf800);
  });
});

describe("parseDat fixture", () => {
  const red = packRgb565(255, 0, 0);
  const blue = packRgb565(0, 0, 255);
  const green = packRgb565(0, 255, 0);

  const buf = buildDat({
    color: "rgb565",
    settlers: [
      [
        { width: 2, height: 1, offsetX: -4, offsetY: -8, pixels: [red, 0] },
        { width: 2, height: 1, offsetX: -3, offsetY: -8, pixels: [0, red] },
      ],
    ],
    torsos: [[{ width: 1, height: 1, offsetX: -4, offsetY: -8, pixels: [31] }]],
    shadows: [[{ width: 2, height: 1, offsetX: -2, offsetY: -6, pixels: [1, 1] }]],
    landscapes: [{ width: 2, height: 2, pixels: [red, green, blue, red] }],
    guis: [{ width: 1, height: 2, pixels: [blue, 0] }],
  });

  const dat = parseDat(buf, "rgb565", 10, "siedler3_10.f8007e01f.dat");

  it("indexes sequences by type id", () => {
    expect(dat.counts()).toEqual({ settler: 1, torso: 1, shadow: 1, landscape: 1, gui: 1 });
    expect(dat.frameCount("settler", 0)).toBe(2);
    expect(dat.errors.filter((e) => !e.startsWith("stored size"))).toEqual([]);
  });

  it("decodes settler RLE with skip", () => {
    const a = dat.decode("settler", 0, 0);
    expect(a).toMatchObject({ width: 2, height: 1, offsetX: -4, offsetY: -8 });
    expect([...a.rgba.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect(a.rgba[7]).toBe(0);

    const b = dat.decode("settler", 0, 1);
    expect(b.rgba[3]).toBe(0);
    expect([...b.rgba.subarray(4, 8)]).toEqual([255, 0, 0, 255]);
  });

  it("decodes torso 5-bit gray and shadow mask", () => {
    const torso = dat.decode("torso", 0, 0);
    expect([...torso.rgba]).toEqual([255, 255, 255, 255]);
    const shadow = dat.decode("shadow", 0, 0);
    expect(shadow.rgba[3]).toBe(136);
    expect(shadow.rgba[7]).toBe(136);
    expect(shadow.rgba[0]).toBe(0);
  });

  it("decodes landscape and gui", () => {
    const land = dat.decode("landscape", 0, 0);
    expect(land.width).toBe(2);
    expect(land.height).toBe(2);
    expect([...land.rgba.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...land.rgba.subarray(4, 8)]).toEqual([0, 255, 0, 255]);
    expect([...land.rgba.subarray(8, 12)]).toEqual([0, 0, 255, 255]);

    const gui = dat.decode("gui", 0, 0);
    expect(gui.width).toBe(1);
    expect(gui.height).toBe(2);
    expect([...gui.rgba.subarray(0, 4)]).toEqual([0, 0, 255, 255]);
    expect(gui.rgba[7]).toBe(0);
  });

  it("composites with min hotspot", () => {
    const out = compositeSettler(
      dat.decode("settler", 0, 0),
      dat.decode("torso", 0, 0),
      dat.decode("shadow", 0, 0),
      [0, 80, 180],
    );
    expect(out.offsetX).toBe(-4);
    expect(out.offsetY).toBe(-8);
    expect(out.width).toBeGreaterThan(0);
  });
});

describe("torso alignment", () => {
  it("pads missing torsos to the front of the settler list", () => {
    const red = packRgb565(255, 0, 0);
    const body = { width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: [red] };
    const dat = parseDat(
      buildDat({
        color: "rgb565",
        settlers: [[body], [body], [body]],
        torsos: [[{ width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: [31] }]],
      }),
      "rgb565",
      12,
      "siedler3_12.f8007e01f.dat",
    );
    expect(dat.counts().torso).toBe(3);
    expect(dat.decode("torso", 0, 0).width).toBe(0);
    expect(dat.decode("torso", 1, 0).width).toBe(0);
    expect(dat.decode("torso", 2, 0).width).toBe(1);
    expect(dat.decode("torso", 2, 0).rgba[0]).toBe(255);
  });
});

describe("landscape atlas", () => {
  it("wraps a tile into its 32px cell", () => {
    const red = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]);
    const img = { width: 2, height: 2, offsetX: 0, offsetY: 0, rgba: red };
    const atlas = packLandscapeAtlas([img]);
    expect(atlas.width).toBe(TEXTURE_SIZE);
    const [gx, gy] = TEXTURE_POSITIONS[0]!;
    const x = gx * TEXTURE_GRID;
    const y = gy * TEXTURE_GRID;
    const i = (y * TEXTURE_SIZE + x) * 4;
    expect([...atlas.rgba.subarray(i, i + 4)]).toEqual([255, 0, 0, 255]);
    const iWrap = (y * TEXTURE_SIZE + x + 2) * 4;
    expect([...atlas.rgba.subarray(iWrap, iWrap + 4)]).toEqual([255, 0, 0, 255]);
  });
});
