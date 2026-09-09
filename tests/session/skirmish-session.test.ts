import { afterEach, describe, expect, it, vi } from "vitest";
import { Session } from "../../src/session/session/session";
import {
  PresentationView,
  matchSpeed,
} from "../../src/session/session/presentationView";
import { World } from "../../src/sim/world/world";
import { emptyUtcMap } from "../../src/shared/map/utcmap";
import {
  defaultSlots,
  createSkirmishMatch,
} from "../../src/shared/match/skirmish";
import { playerObservation } from "../../src/sim/ai/frame";
import { FogOfWar } from "../../src/render/visibility/fogOfWar";
import { Scene } from "three";
import { Room, MemoryChannel, Lockstep } from "../../src/net";

afterEach(() => vi.unstubAllGlobals());
const map = emptyUtcMap();
function fixture(player: number | null = 0, speed = 1) {
  const { match } = createSkirmishMatch(
    { mapId: "test", slots: defaultSlots(map.playerStarts, player) },
    map.playerStarts,
    "rev",
  );
  const world = new World({ map, slots: match.slots, seed: 1 });
  const room = new Room(match),
    channels = match.slots.map((s) => new MemoryChannel(room, s.player));
  const peers = new Map(
    channels.map((ch, i) => [
      match.slots[i].player,
      new Lockstep(ch, match.slots[i].player, match.delay),
    ]),
  );
  const session = Object.assign(Object.create(Session.prototype), {
    world,
    me: player ?? 0,
    visionPlayer: player ?? 0,
    config: { player, hooks: { onHud: vi.fn() } },
    speed,
    renderer: {},
    room,
    match,
    loadedMap: { map },
    locksteps: peers,
    channels,
    acc: 0,
  });
  return { world, session, peers, channels };
}
describe("skirmish presentation and transport", () => {
  it("reveals all entities without altering checksum, explored cells, player commands or AI information", () => {
    const { world } = fixture(),
      projection = new PresentationView(),
      before = world.checksum();
    const own = world.view(0),
      cells = own.settlement.fog!.cells.slice();
    const aiBefore = structuredClone(
      playerObservation(own.settlement, "player.1"),
    );
    const shown = projection.project(world, 0, true);
    expect(shown.settlement.entities.some((e) => e.owner === "player.2")).toBe(
      true,
    );
    expect(own.settlement.entities.some((e) => e.owner === "player.2")).toBe(
      false,
    );
    expect(shown.settlement.fog!.cells.every((v) => v === 2)).toBe(true);
    expect(world.checksum()).toBe(before);
    expect(world.view(0).settlement.fog!.cells).toEqual(cells);
    expect(playerObservation(world.view(0).settlement, "player.1")).toEqual(
      aiBefore,
    );
    expect(projection.project(world, 0, false).settlement).toEqual(
      own.settlement,
    );
    const shader = new FogOfWar(map.size),
      scene = new Scene();
    shader.update(own.settlement.fog!, scene);
    const original = shader.texture.image.data!.slice();
    shader.update(shown.settlement.fog!, scene);
    expect(shader.texture.image.data).not.toEqual(original);
    shader.update(own.settlement.fog!, scene);
    expect(
      shader.texture.image.data!.every(
        (value, index) => index % 4 === 3 || value === original[index],
      ),
    ).toBe(true);
    shader.dispose();
  });
  it("human commands keep their owning view while the presentation is revealed or following P2", () => {
    const { session, world, channels } = fixture(0);
    session.reveal = true;
    session.visionPlayer = 1;
    expect(
      session
        .visualView()
        .settlement.entities.some(
          (e: { owner: string }) => e.owner === "player.2",
        ),
    ).toBe(true);
    expect(session.selectionView()).toBe(world.view(0).settlement);
    session.reveal = false;
    expect(session.visualView().settlement).toBe(world.view(1).settlement);
    expect(session.selectionView()).toBe(world.view(0).settlement);
    channels.forEach((c) => c.destroy());
  });
  it("observer cannot enqueue commands while both AI mailboxes keep advancing", () => {
    vi.stubGlobal("document", { hidden: true });
    const { session, world, peers, channels } = fixture(null);
    expect(session.send({ type: "ping" })).toBe(false);
    expect([...peers.values()].every((p) => p.outbox().length === 0)).toBe(
      true,
    );
    for (let n = 0; n < 40; n++) session.tick(50, n * 50);
    expect(world.clock.tickIndex).toBe(80);
    expect(new Set(world.log().map((a) => a.player))).toEqual(new Set([0, 1]));
    const save = session.snapshotLocal(),
      checksum = world.checksum();
    session.restoreLocal(save);
    expect(session.world.checksum()).toBe(checksum);
    expect(session.send({ type: "ping" })).toBe(false);
    channels.forEach((c) => c.destroy());
    session.channels.forEach((c: MemoryChannel) => c.destroy());
  });
  it("P2 input is submitted through P2, not the first transport slot", () => {
    const { session, peers, channels } = fixture(1);
    expect(session.send({ type: "ping" })).toBe(true);
    expect(peers.get(1)!.outbox()).toEqual([{ type: "ping" }]);
    expect(peers.get(0)!.outbox()).toEqual([]);
    channels.forEach((c) => c.destroy());
  });
  it.each([1, 2, 3, 4])(
    "runs %ix fixed simulation steps while retaining the same result per tick",
    (speed) => {
      vi.stubGlobal("document", { hidden: true });
      const a = fixture(null, speed),
        b = fixture(null, 1);
      a.session.tick(100, 100);
      for (let n = 0; n < speed; n++) b.session.tick(100, (n + 1) * 100);
      expect(a.world.clock.tickIndex).toBe(4 * speed);
      expect(a.world.clock.tickMs).toBe(25);
      expect(a.world.checksum()).toBe(b.world.checksum());
      [...a.channels, ...b.channels].forEach((c) => c.destroy());
    },
  );
  it("keeps fractional time through speed changes and caps catch-up after a long stall", () => {
    vi.stubGlobal("document", { hidden: true });
    const a = fixture(null);
    a.session.tick(10, 10);
    a.session.speed = 4;
    a.session.tick(10, 20);
    expect(a.world.clock.tickIndex).toBe(2);
    a.session.tick(100000, 100020);
    expect(a.world.clock.tickIndex).toBe(34);
    expect(a.session.acc).toBeLessThan(25);
    a.channels.forEach((c) => c.destroy());
  });
  it("forces network speed to 1x and rejects unsupported rates", () => {
    expect(matchSpeed(4, true)).toBe(1);
    for (const rate of [0, -1, 1.5, 5, Infinity, NaN])
      expect(matchSpeed(rate, false)).toBe(1);
  });
});
