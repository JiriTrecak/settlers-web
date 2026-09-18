import { afterEach, describe, expect, it, vi } from "vitest";
import {SimulationRuntime} from "../../src/session/worker/runtime";
import {
  PresentationView,
  matchSpeed,
} from "../../src/session/session/presentationView";
import { emptyUtcMap } from "../../src/shared/map/utcmap";
import {
  defaultSlots,
  createSkirmishMatch,
} from "../../src/shared/match/skirmish";
import { playerObservation } from "../../src/sim/ai/frame";
import { FogOfWar } from "../../src/render/visibility/fogOfWar";
import { Scene } from "three";
import type {MemoryChannel} from "../../src/net";

afterEach(() => vi.unstubAllGlobals());
const map = emptyUtcMap();
function fixture(player: number | null = 0, speed = 1) {
  const { match } = createSkirmishMatch(
    { mapId: "test", slots: defaultSlots(map.playerStarts, player) },
    map.playerStarts,
    "rev",
  );
  const receive=vi.fn();
  const session=new SimulationRuntime({map,match:{...match,seed:1},player,remote:false},undefined,{chat:receive});
  session.speed=speed;
  return {world:session.world,session,peers:session.locksteps,channels:session.channels,receive};
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
    for (let n = 0; n < 40; n++) session.advance(50);
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
  it("pauses local simulation and pending orders while the game menu is open",()=>{
    vi.stubGlobal("document",{hidden:true});
    const {session,world,channels}=fixture(1);
    session.send({type:"ping"});session.setPaused(true);
    const before=world.checksum();session.advance(10000);
    expect(world.clock.tickIndex).toBe(0);expect(world.checksum()).toBe(before);
    session.setPaused(false);session.advance(25);
    expect(world.clock.tickIndex).toBe(1);
    expect(world.log().some(a=>a.player===1)).toBe(true);
    channels.forEach(c=>c.destroy());
  });
  it("round trips P2 and rejects a save assigned to another human",()=>{
    vi.stubGlobal("document",{hidden:true});
    const {session,world,channels}=fixture(1);
    session.advance(100);const save=session.snapshotLocal(),checksum=world.checksum();
    expect(save).toMatchObject({v:4,mode:"skirmish",player:1});
    expect(()=>session.restoreLocal({...save,player:0})).toThrow(/player setup/);
    expect(()=>session.restoreLocal({...save,mode:"campaign"})).toThrow(/mode/);
    session.restoreLocal(JSON.parse(JSON.stringify(save)));
    expect(session.world.checksum()).toBe(checksum);
    expect(session.send({type:"ping"})).toBe(true);
    channels.forEach(c=>c.destroy());session.channels.forEach((c:MemoryChannel)=>c.destroy());
  });
  it("AI says gg once when its main objective is nearly destroyed", () => {
    vi.stubGlobal("document", { hidden: true });
    const {session, world, channels,receive} = fixture(0);
    const hall = world.settlement.entities.find(e => e.id === world.settlement.state.objectives["player.2"])!;
    hall.hp = 1;
    session.advance(50); session.advance(50);
    expect(receive).toHaveBeenCalledTimes(1);
    expect(receive.mock.calls[0][0]).toMatchObject({player: 1, text: "gg"});
    channels.forEach(c => c.destroy());
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
      a.session.advance(100);
      for (let n = 0; n < speed; n++) b.session.advance(100);
      expect(a.world.clock.tickIndex).toBe(4 * speed);
      expect(a.world.clock.tickMs).toBe(25);
      expect(a.world.checksum()).toBe(b.world.checksum());
      [...a.channels, ...b.channels].forEach((c) => c.destroy());
    },
  );
  it("keeps fractional time through speed changes and caps catch-up after a long stall", () => {
    vi.stubGlobal("document", { hidden: true });
    const a = fixture(null);
    a.session.advance(10);
    a.session.speed = 4;
    a.session.advance(10);
    expect(a.world.clock.tickIndex).toBe(2);
    a.session.advance(100000);
    expect(a.world.clock.tickIndex).toBe(34);
    expect(a.session.acc).toBeLessThanOrEqual(25*8*4);
    a.channels.forEach((c) => c.destroy());
  });
  it("forces network speed to 1x and rejects unsupported rates", () => {
    expect(matchSpeed(4, true)).toBe(1);
    for (const rate of [0, -1, 1.5, 5, Infinity, NaN])
      expect(matchSpeed(rate, false)).toBe(1);
  });
});
