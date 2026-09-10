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
  it("assigns sequential room ids", () => {
    const host = new MatchHost();
    expect(host.create(draft()).room.id).toBe("1");
    expect(host.create(draft()).room.id).toBe("2");
  });

  it("lists waiting rooms", () => {
    const host = new MatchHost();
    expect(host.list()).toEqual([]);
    const created = host.create(draft());
    expect(host.list().map((r) => r.id)).toEqual([created.room.id]);
  });

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

  it("commits turns without waiting for ready/go", () => {
    const host = new MatchHost();
    const created = host.create(draft());
    const room = host.get(created.room.id)!;
    const joined = room.join("p2", "player") as { token: string };
    const a: ServerMsg[] = [];
    room.bind(created.token, (m) => a.push(m));
    room.bind(joined.token, () => {});
    room.start(created.token);
    room.ingest(created.token, { type: "turn", through: 1, bundles: [] });
    expect(a.some((m) => m.type === "commit")).toBe(false);
    room.ingest(joined.token, { type: "turn", through: 1, bundles: [] });
    expect(a.some((m) => m.type === "commit" && m.tick === 1)).toBe(true);
  });

  it("strips noop out of a turn before commit", () => {
    const host = new MatchHost();
    const created = host.create(draft());
    const room = host.get(created.room.id)!;
    const joined = room.join("p2", "player") as { token: string };
    const a: ServerMsg[] = [];
    room.bind(created.token, (m) => a.push(m));
    room.bind(joined.token, () => {});
    room.start(created.token);
    room.ingest(created.token, {
      type: "turn",
      through: 1,
      bundles: [
        {
          tick: 1,
          actions: [{ type: "noop" }, { type: "ping" }],
        },
      ],
    });
    room.ingest(joined.token, { type: "turn", through: 1, bundles: [] });
    const commit = a.find((m) => m.type === "commit" && m.tick === 1);
    expect(commit?.type === "commit" && commit.slots[0]!.actions.map((x) => x.type)).toEqual(["ping"]);
  });

  it("discard ends the room and drops it from the list", () => {
    const host = new MatchHost();
    const created = host.create(draft());
    expect(host.list()).toHaveLength(1);
    expect(host.discard(created.room.id)).toBe(true);
    expect(host.list()).toEqual([]);
    expect(host.get(created.room.id)).toBeUndefined();
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

  it("hashOk when both checksums match", () => {
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
    room.ingest(created.token, { type: "hash", tick: 8, checksum: 7 });
    room.ingest(joined.token, { type: "hash", tick: 8, checksum: 7 });
    expect(a.some((m) => m.type === "hashOk" && m.tick === 8)).toBe(true);
    expect(a.some((m) => m.type === "desync")).toBe(false);
  });

  it("start from a guest is not_host", () => {
    const host = new MatchHost();
    const created = host.create(draft());
    const room = host.get(created.room.id)!;
    const joined = room.join("p2", "player") as { token: string };
    expect(room.start(joined.token)).toEqual({ error: "not_host" });
    expect(room.view().state).toBe("waiting");
  });

  it("join as player is full once every seat is taken", () => {
    const host = new MatchHost();
    const created = host.create(draft());
    const room = host.get(created.room.id)!;
    expect(room.join("p2", "player")).toMatchObject({ you: { role: "player", player: 1 } });
    expect(room.join("p3", "player")).toEqual({ error: "full" });
  });

  it("spectator can sit in the lobby before start", () => {
    const host = new MatchHost();
    const created = host.create(draft());
    const room = host.get(created.room.id)!;
    const spec = room.join("eve", "spectator") as { you: { role: string } };
    expect(spec.you.role).toBe("spectator");
    expect(room.view().spectators).toBe(1);
    expect(room.view().state).toBe("waiting");
    expect(room.join("p2", "player")).toMatchObject({ you: { player: 1 } });
  });

  it("restart while waiting is not_playing", () => {
    const host = new MatchHost();
    const created = host.create(draft());
    const room = host.get(created.room.id)!;
    expect(room.restart(created.token)).toEqual({ error: "not_playing" });
  });

  it("player join after start is not_waiting", () => {
    const host = new MatchHost();
    const created = host.create(draft());
    const room = host.get(created.room.id)!;
    room.join("p2", "player");
    room.start(created.token);
    expect(room.join("late", "player")).toEqual({ error: "not_waiting" });
    expect(room.join("eve", "spectator")).toMatchObject({ you: { role: "spectator" } });
  });

  it("load after shutdown is ended", () => {
    const host = new MatchHost();
    const created = host.create(draft());
    const room = host.get(created.room.id)!;
    room.shutdown();
    expect(room.load(created.token, { v: 1, remote: true })).toEqual({ error: "ended" });
    expect(room.view().state).toBe("ended");
  });
});

it("clears all sessions, notifies players, and never reuses deleted ids", () => {
  const host = new MatchHost();
  const waiting = host.create(draft());
  const playing = host.create(draft());
  const ended = host.create(draft());
  const messages: ServerMsg[] = [];
  host.get(waiting.room.id)!.bind(waiting.token, (m) => messages.push(m));
  host.get(playing.room.id)!.bind(playing.token, (m) => messages.push(m));
  host.get(playing.room.id)!.start(playing.token);
  host.get(ended.room.id)!.shutdown();
  expect(host.discardAll()).toBe(3);
  expect(host.list()).toEqual([]);
  for (const room of [waiting, playing, ended]) expect(host.get(room.room.id)).toBeUndefined();
  expect(messages.filter((m) => m.type === "ended")).toHaveLength(2);
  expect(host.discardAll()).toBe(0);
  expect(host.create(draft()).room.id).toBe("4");
});
