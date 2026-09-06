import { describe, expect, it } from "vitest";
import { inStamp, MAP_HALO, MAP_SIZE } from "../../src/shared";

describe("inStamp", () => {
  it("allows the playable square and the halo, not the fringe", () => {
    expect(inStamp(0, 0)).toBe(true);
    expect(inStamp(MAP_SIZE - 1, MAP_SIZE - 1)).toBe(true);
    expect(inStamp(-MAP_HALO, 0)).toBe(true);
    expect(inStamp(MAP_SIZE + MAP_HALO - 1, 8)).toBe(true);
    expect(inStamp(-MAP_HALO - 1, 0)).toBe(false);
    expect(inStamp(MAP_SIZE + MAP_HALO, 0)).toBe(false);
  });
});
