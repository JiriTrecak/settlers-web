import { describe, expect, it } from "vitest";
import { DEFAULT_GAME_SPEED, GAME_SPEEDS, isGameSpeed } from "../../src/ui/speed/speed";

describe("game speed", () => {
  it("is 1, 2, 4, or 8", () => {
    expect(GAME_SPEEDS).toEqual([1, 2, 4, 8]);
    expect(DEFAULT_GAME_SPEED).toBe(2);
    expect(isGameSpeed(1)).toBe(true);
    expect(isGameSpeed(8)).toBe(true);
    expect(isGameSpeed(3)).toBe(false);
    expect(isGameSpeed(16)).toBe(false);
  });
});
