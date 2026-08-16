import { describe, expect, it } from "vitest";
import { encodePng } from "./png";

describe("png", () => {
  it("writes a valid signature and IHDR", () => {
    const rgba = new Uint8ClampedArray(2 * 2 * 4);
    rgba.set([255, 0, 0, 255], 0);
    const buf = encodePng(2, 2, rgba);
    expect([...buf.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(buf.toString("ascii", 12, 16)).toBe("IHDR");
    expect(buf.readUInt32BE(16)).toBe(2);
    expect(buf.readUInt32BE(20)).toBe(2);
  });
});
