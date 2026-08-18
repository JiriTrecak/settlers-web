import { describe, expect, it } from "vitest";
import { MATCH_HOST, matchUrl } from "../../src/net";

describe("lobby", () => {
  it("points lockstep at MATCH_HOST, not the page origin", () => {
    expect(MATCH_HOST).toBe("18.134.138.1:8787");
    expect(matchUrl("room-1", "tok")).toBe("ws://18.134.138.1:8787/match/room-1?token=tok");
  });
});
