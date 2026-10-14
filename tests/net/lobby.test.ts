import { describe, expect, it } from "vitest";
import { MATCH_HOST, matchUrl } from "../../src/net";
import { matchHttp } from "../../src/shared/net/endpoint";

describe("lobby", () => {
  it("points lockstep at MATCH_HOST, not the page origin", () => {
    expect(new URL(matchHttp('/api/rooms')).protocol).toBe('https:');
    expect(new URL(matchHttp('/api/rooms')).host).toBe(MATCH_HOST);
    expect(matchUrl("room-1", "tok")).toBe(`wss://${MATCH_HOST}/match/room-1?token=tok`);
  });
});
