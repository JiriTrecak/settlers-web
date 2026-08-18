/** MatchHost: start/ready/go, commits, drop, hash. No World. */
import { describe, expect, it } from "vitest";
import { MatchHost } from "../../src/net";
import type { ServerMsg } from "../../src/shared";

function draft(slotCount = 2) {
  return {
    name: "test",
    mapId: "map",
    mapRevision: "map.json",
    slotCount,
    guestName: "host",
  };
}

describe("MatchHost", () => {
  it("start → ready → go, then a commit when both slots confirm", () => {
    const host = new MatchHost();
    const created = host.create(draft());
    const room = host.get(created.room.id)!;
    const joined = room.join("p2", "player") as { token: string };
    const a: ServerMsg[] = [];
    const b: ServerMsg[] = [];
    room.bind(created.token, (m) => a.push(m));
    room.bind(joined.token, (m) => b.push(m));
    expect(room.start(created.token)).toMatchObject({ config: { v: 1 } });
    expect(a.some((m) => m.type === "start")).toBe(true);
    expect(b.some((m) => m.type === "start")).toBe(true);

    room.ingest(created.token, { type: "ready" });
    expect(a.some((m) => m.type === "go")).toBe(false);
    room.ingest(joined.token, { type: "ready" });
    expect(a.some((m) => m.type === "go")).toBe(true);
    expect(b.some((m) => m.type === "go")).toBe(true);

    room.ingest(created.token, { type: "turn", through: 1, bundles: [] });
    expect(a.some((m) => m.type === "commit")).toBe(false);
    room.ingest(joined.token, { type: "turn", through: 1, bundles: [] });
    const commit = a.find((m) => m.type === "commit");
    expect(commit).toMatchObject({ type: "commit", tick: 1 });
    if (commit?.type === "commit") {
      expect(commit.slots.map((s) => s.player)).toEqual([0, 1]);
      expect(commit.slots.every((s) => s.actions.length === 0)).toBe(true);
    }
  });

  it("drop lets the remaining slot advance", () => {
    const host = new MatchHost();
    const created = host.create(draft());
    const room = host.get(created.room.id)!;
    const joined = room.join("p2", "player") as { token: string };
    const a: ServerMsg[] = [];
    room.bind(created.token, (m) => a.push(m));
    room.bind(joined.token, () => {});
    room.start(created.token);
    room.ingest(created.token, { type: "ready" });
    room.ingest(joined.token, { type: "ready" });
    room.unbind(joined.token);
    a.length = 0;
    room.ingest(created.token, { type: "turn", through: 1, bundles: [] });
    expect(a.some((m) => m.type === "commit" && m.tick === 1)).toBe(true);
  });

  it("hash mismatch desyncs", () => {
    const host = new MatchHost();
    const created = host.create(draft());
    const room = host.get(created.room.id)!;
    const joined = room.join("p2", "player") as { token: string };
    const a: ServerMsg[] = [];
    room.bind(created.token, (m) => a.push(m));
    room.bind(joined.token, () => {});
    room.start(created.token);
    room.ingest(created.token, { type: "ready" });
    room.ingest(joined.token, { type: "ready" });
    room.ingest(created.token, { type: "hash", tick: 8, checksum: 1 });
    room.ingest(joined.token, { type: "hash", tick: 8, checksum: 2 });
    expect(a.some((m) => m.type === "desync" && m.tick === 8)).toBe(true);
  });
});
