import { describe, expect, it } from "vitest";
import { packOf, packOrder, packsForCivs } from "../../original_conv/atlas/groups";
import { blitPadded, packPages } from "../../original_conv/atlas/pack";
import { decodePng, encodePng } from "../../original_conv/png";

describe("atlas groups", () => {
  it("splits by civ and skips landscape / gui / uncatalogued", () => {
    expect(packOf({ path: "settlers/roman/bearer/walk/none/ne/00.png", group: "settlers/roman/bearer/walk/none/ne" })).toBe(
      "settlers-roman",
    );
    expect(packOf({ path: "buildings/egyptian/farm/built.png", group: "buildings/egyptian/farm" })).toBe(
      "buildings-egyptian",
    );
    expect(packOf({ path: "props/tree-1/000.png", group: "props/tree-1", category: "props" })).toBe("props");
    expect(packOf({ path: "settlers/shared/flag/00.png", group: "settlers/shared/flag" })).toBe("settlers-shared");
    expect(packOf({ path: "landscape-atlas.png" })).toBeNull();
    expect(packOf({ path: "uncatalogued/gui/61/000/000.png", category: "uncatalogued" })).toBeNull();
  });

  it("orders contact-sheet packs roman-first", () => {
    expect(packOrder(["settlers-amazon", "props", "buildings-roman", "settlers-roman"])).toEqual([
      "props",
      "buildings-roman",
      "settlers-roman",
      "settlers-amazon",
    ]);
  });

  it("match packs are props + shared + that civ", () => {
    expect(packsForCivs(["roman"])).toEqual(["props", "settlers-shared", "buildings-roman", "settlers-roman"]);
  });
});

describe("atlas pack", () => {
  it("fills a page and spills to the next", () => {
    const sizes = Array.from({ length: 8 }, () => ({ w: 10, h: 10 }));
    const { pages, skipped } = packPages(sizes, 32, 1);
    expect(skipped).toEqual([]);
    expect(pages.length).toBeGreaterThanOrEqual(1);
    const placed = pages.reduce((n, p) => n + p.frames.length, 0);
    expect(placed).toBe(8);
    const first = pages[0]!.frames[0]!;
    expect(first.x).toBe(1);
    expect(first.y).toBe(1);
  });

  it("skips frames larger than the page", () => {
    const { pages, skipped } = packPages([{ w: 64, h: 8 }, { w: 8, h: 8 }], 32, 1);
    expect(skipped).toEqual([0]);
    expect(pages[0]!.frames).toHaveLength(1);
    expect(pages[0]!.frames[0]!.i).toBe(1);
  });

  it("clones the edge into the pad gutter", () => {
    const src = new Uint8ClampedArray([10, 20, 30, 255]);
    const dest = new Uint8ClampedArray(3 * 3 * 4);
    blitPadded(dest, 3, 3, src, 1, 1, 1, 1, 1);
    expect([...dest.subarray(0, 4)]).toEqual([10, 20, 30, 255]);
    expect([...dest.subarray(4 * 4, 4 * 4 + 4)]).toEqual([10, 20, 30, 255]);
  });
});

describe("png roundtrip", () => {
  it("decodes what encodePng writes", () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255, 255, 255, 0, 1]);
    const buf = encodePng(2, 2, rgba);
    const out = decodePng(buf);
    expect(out.width).toBe(2);
    expect(out.height).toBe(2);
    expect([...out.rgba]).toEqual([...rgba]);
  });
});
