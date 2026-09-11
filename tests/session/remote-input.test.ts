import { afterEach, expect, it, vi } from "vitest";
import { Session } from "../../src/session/session/session";
import { World } from "../../src/sim/world/world";
import { emptyUtcMap } from "../../src/shared/map/utcmap";
import { localMatch, type ServerMsg } from "../../src/shared";
import { Lockstep, Room, type Channel } from "../../src/net";
import {connectionDelay} from '../../src/net/latency';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** Real Session tick/input paths and Room/Lockstep, with ordered delayed wires. */
function fixture(latency: (packet: number) => number = () => 0, delay=8) {
  vi.stubGlobal("document", { hidden: true });
  const match = localMatch({ mapId: "test", mapRevision: "test", seed: 1, slotCount: 2, me: 0, delay });
  match.slots.forEach(slot => slot.kind = "human");
  const map = emptyUtcMap(), room = new Room(match);
  let now = 0, packet = 0;
  const pending: { at: number; deliver: () => void }[] = [];
  function wire() {
    let last = 0;
    return (deliver: () => void) => {
      const at = last = Math.max(last, now + latency(packet++));
      pending.push({ at, deliver });
    };
  }
  const peers = [0, 1].map(me => {
    const upstream = wire(), downstream = wire();
    let receive: (msg: ServerMsg) => void = () => {};
    room.subscribe(msg => {
      const copy = structuredClone(msg);
      downstream(() => receive(copy));
    });
    const channel: Channel = {
      send(msg) {
        if (msg.type !== "turn") return;
        const copy = structuredClone(msg);
        upstream(() => room.confirm(me, copy.through, copy.bundles));
      },
      onMessage(fn) { receive = fn; },
    };
    const world = new World({ map, slots: match.slots, seed: 1 });
    const lockstep = new Lockstep(channel, me, match.delay);
    const session = Object.assign(Object.create(Session.prototype), {
    started: true,
      world, me, visionPlayer: me, match,
      config: { channel, player: me, hooks: { onHud: vi.fn() } },
      renderer: { gameCommandFeedback: vi.fn() },
      locksteps: new Map([[me, lockstep]]), acc: 0, speed: 1, desynced: false,
    });
    return { world, session, lockstep };
  });
  function deliver(time = now) {
    now = time;
    // Messages generated during a delivery can also arrive in this pump.
    for (;;) {
      pending.sort((a, b) => a.at - b.at);
      if (!pending.length || pending[0].at > now) break;
      pending.shift()!.deliver();
    }
  }
  return { peers, room, deliver, match };
}

it.each([5,25,75,150])('executes movement promptly and identically with a pipeline measured for %i ms one-way delivery',oneWay=>{
  const delay=connectionDelay([oneWay*2,oneWay*2]);
  const {peers,deliver}=fixture(()=>oneWay,delay);
  const time=vi.spyOn(performance,'now').mockReturnValue(0);
  const actors=peers.map(p=>p.world.settlement.entities.find(e=>e.owner==='player.1'&&e.definition==='unit.ants.warrior')!);
  const rotations=actors.map(e=>e.rotation),responded=[0,0];
  for(let ms=0;ms<=2500;ms+=5){
    time.mockReturnValue(ms);deliver(ms);
    if(ms===1000){
      const destination=peers[0].world.settlement.spatial.nearest({x:actors[0].x+4,y:actors[0].y+2},8,actors[0].id)!;
      peers[0].session.send({type:'move',actors:[actors[0].id],destination});
    }
    for(const [i,p] of peers.entries()){
      if(ms%25===0)p.session.pulseConfirm();
      if(ms>0&&ms%10===0)p.session.tick(10,ms);
      if(ms>=1000&&!responded[i]&&actors[i].rotation!==rotations[i])responded[i]=ms;
    }
  }
  for(const response of responded){expect(response).toBeGreaterThanOrEqual(1000);expect(response-1000).toBeLessThanOrEqual((delay+2)*25);}
  if(oneWay===5)expect(Math.max(...responded)-1000).toBeLessThan(100);
  expect(peers[0].world.log()).toEqual(peers[1].world.log());
  expect(peers[0].world.clock.tickIndex).toBe(peers[1].world.clock.tickIndex);
  expect(peers[0].world.checksum()).toBe(peers[1].world.checksum());
});

it("does not promise extra empty turns while the displayed match is suspended", () => {
  const { peers, deliver, match } = fixture();
  const time = vi.spyOn(performance, "now").mockReturnValue(0);
  for (const p of peers) p.session.armConfirms(match);
  // Timers can wake while no render/simulation frames run.
  for (let ms = 25; ms <= 10000; ms += 25) {
    time.mockReturnValue(ms);
    for (const p of peers) p.session.pulseConfirm();
    deliver(ms);
  }
  for (const p of peers) {
    clearInterval(p.session.confirmTimer);
    expect(p.world.clock.tickIndex).toBe(0);
    expect(p.lockstep.sent()).toBe(8);
  }
  peers[0].session.send({ type: "ping" });
  deliver();
  expect(peers[0].lockstep.sent()).toBe(9);
  for (let tick = 1; tick <= 12; tick++) {
    for (const p of peers) { p.session.tick(25, tick * 25); deliver(); }
  }
  expect(peers[0].world.log()).toEqual([{ tick: 9, player: 0, action: { type: "ping" } }]);
  expect(peers[1].world.log()).toEqual(peers[0].world.log());
  expect(peers[1].world.checksum()).toBe(peers[0].world.checksum());
});

it("keeps the 40 Hz simulation at 10 FPS and limits a single catch-up batch", () => {
  const { peers, deliver } = fixture();
  for (const p of peers) p.session.pulseConfirm();
  deliver();
  for (let frame = 1; frame <= 20; frame++) {
    for (const p of peers) { p.session.tick(100, frame * 100); deliver(); }
  }
  expect(peers.map(p => p.world.clock.tickIndex)).toEqual([80, 80]);
  expect(peers[0].world.checksum()).toBe(peers[1].world.checksum());
  for (const p of peers) p.session.pulseConfirm();
  deliver();
  for (const p of peers) { p.session.tick(10000, 12000); deliver(); }
  expect(peers.map(p => p.world.clock.tickIndex)).toEqual([88, 88]);
  expect(peers[0].world.checksum()).toBe(peers[1].world.checksum());
});

it("bounds the input frontier during a large burst and drains all batches in order", () => {
  const { peers, deliver, match } = fixture();
  for (const p of peers) p.session.pulseConfirm();
  deliver();
  for (let n = 0; n < 150; n++) {
    peers[0].session.send({ type: "move", actors: [1], destination: { x: n + 1, y: 10 } });
    deliver();
  }
  expect(peers[0].lockstep.sent()).toBe(match.delay + 1);
  expect(peers[0].lockstep.outbox()).toHaveLength(149);
  for (let tick = 1; tick <= 20; tick++) {
    for (const p of peers) {
      p.session.tick(25, tick * 25);
      deliver();
      expect(p.lockstep.sent() - p.world.clock.tickIndex).toBeLessThanOrEqual(match.delay + 1);
    }
  }
  const log = peers[0].world.log();
  expect(log).toHaveLength(150);
  expect(log.map(entry => entry.action)).toEqual(Array.from({ length: 150 }, (_, n) => ({
    type: "move", actors: [1], destination: { x: n + 1, y: 10 },
  })));
  expect(new Set(log.map(entry => entry.tick))).toEqual(new Set([9, 10, 11, 12]));
  expect(peers[1].world.log()).toEqual(log);
  expect(peers[0].world.checksum()).toBe(peers[1].world.checksum());
});

it.each([connectionDelay([150]),8])("retains every burst order with jitter, unequal frames and a suspended peer at delay %i", delay => {
  const { peers, deliver } = fixture(packet => [25, 75, 40, 60][packet % 4],delay);
  const received = [new Map<number, string>(), new Map<number, string>()];
  for (let ms = 0; ms <= 5000; ms += 25) {
    deliver(ms);
    if (ms === 1000) {
      // Separate immediate flushes must neither overwrite nor duplicate input.
      for (let i = 0; i < 6; i++) peers[0].session.send({ type: "ping" });
      peers[1].session.send({ type: "ping" });
    }
    for (const [i, p] of peers.entries()) {
      p.session.pulseConfirm();
      for (const commit of p.lockstep.peek()) received[i].set(commit.tick, JSON.stringify(commit));
      const suspended = i === 1 && ms >= 800 && ms < 1600;
      if (!suspended && ms > 0 && ms % (i ? 100 : 25) === 0) p.session.tick(i ? 100 : 25, ms);
    }
  }
  expect(peers.map(p => p.world.log().length)).toEqual([7, 7]);
  expect(peers[0].world.log()).toEqual(peers[1].world.log());
  const common = Math.min(...peers.map(p => p.world.clock.tickIndex));
  expect(common).toBeGreaterThan(100);
  for (let tick = 1; tick <= common; tick++) expect(received[0].get(tick)).toBe(received[1].get(tick));
  // Compare final world states at the same authoritative tick despite frame skew.
  const furthest = Math.max(...peers.map(p => p.world.clock.tickIndex));
  deliver(5100);
  for (const p of peers) {
    p.session.acc = 0;
    for (let n = 0; n < 20 && p.world.clock.tickIndex < furthest; n++) p.session.tick(25, 5100);
    expect(p.world.clock.tickIndex).toBe(furthest);
  }
  expect(peers[0].world.checksum()).toBe(peers[1].world.checksum());
});
