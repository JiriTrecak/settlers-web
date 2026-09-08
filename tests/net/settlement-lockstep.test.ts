import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseUtcMap,
  localMatch,
  type Commit,
  type Action,
} from "../../src/shared";
import { Room, Lockstep, MemoryChannel } from "../../src/net";
import { World } from "../../src/sim/world/world";
const map = parseUtcMap(
  JSON.parse(
    readFileSync(
      new URL(
        "../../assets/maps/showcase/mosswater-divide.utcmap",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
)!;
const config = {
  ...localMatch({
    mapId: "mosswater-divide",
    mapRevision: "test",
    seed: 4,
    slotCount: 2,
    me: 0,
    delay: 3,
  }),
  slots: [
    { player: 0, kind: "human" as const },
    { player: 1, kind: "human" as const },
  ],
};
function apply(world: World, commit: Commit) {
  for (const slot of commit.slots)
    slot.actions.forEach((action, seq) =>
      world.enqueue(action, commit.tick, { player: slot.player, seq }),
    );
  world.tick();
}
describe("settlement lockstep integration", () => {
  it("drains a large input outbox without dropping commands at the packet limit", () => {
    const room = new Room(config),
      a = new Lockstep(new MemoryChannel(room, 0), 0, 3),
      b = new Lockstep(new MemoryChannel(room, 1), 1, 3);
    for (let i = 0; i < 70; i++) a.send({ type: "ping" });
    let received = 0;
    for (let tick = 1; tick <= 4; tick++) {
      a.confirm(tick);
      b.confirm(tick);
      received += a.take(tick)!.slots[0]!.actions.length;
    }
    expect(received).toBe(70);
  });

  it("runs two independent mailboxes through construction, harvesting and population on the real map", () => {
    const room = new Room(config),
      channels = [new MemoryChannel(room, 0), new MemoryChannel(room, 1)],
      peers = channels.map((c, i) => new Lockstep(c, i, 3)),
      worlds = [0, 1].map(
        () => new World({ map, slots: config.slots, seed: 4 }),
      );
    peers[0]!.send({ type: "build", kind: "lumberjack", x: 200, z: 210 });
    peers[0]!.send({ type: "build", kind: "stonemason", x: 210, z: 222 });
    peers[1]!.send({ type: "build", kind: "lumberjack", x: 56, z: 46 });
    peers[1]!.send({ type: "build", kind: "stonemason", x: 46, z: 34 });
    peers[0]!.send({ type: "build", kind: "sawmill", x: 220, z: 220 });
    peers[1]!.send({ type: "build", kind: "sawmill", x: 36, z: 36 });
    for (let tick = 1; tick <= 6000; tick++) {
      if (tick === 2000) {
        peers[0]!.send({ type: "build", kind: "house", x: 222, z: 210 });
        peers[1]!.send({ type: "build", kind: "house", x: 34, z: 46 });
      }
      const first = tick % 2;
      peers[first]!.confirm(tick);
      peers[1 - first]!.confirm(tick);
      for (let i = 0; i < 2; i++) {
        const commit = peers[i]!.take(tick);
        expect(commit).toBeDefined();
        apply(worlds[i]!, commit!);
      }
      if (tick % 200 === 0)
        expect(worlds[0]!.checksum()).toBe(worlds[1]!.checksum());
    }
    const s = worlds[0]!.settlement!;
    for (const owner of [0, 1]) {
      expect(s.workers.filter((w) => w.owner === owner)).toHaveLength(13);
      expect(
        s.buildings.filter((b) => b.owner === owner && b.complete),
      ).toHaveLength(5);
      expect(s.colonies[owner]!.stock.wood).toBeGreaterThan(20);
      expect(s.colonies[owner]!.stock.stone).toBeGreaterThan(22);
    }
    channels.forEach((c) => c.destroy());
  });
  it('delivers recruitment, cancellation, rally and army orders identically to both peers',()=>{
    const room=new Room(config),channels=[new MemoryChannel(room,0),new MemoryChannel(room,1)];
    const peers=channels.map((c,i)=>new Lockstep(c,i,3));
    const worlds=[0,1].map(()=>new World({map,slots:config.slots,seed:4}));
    peers[0]!.send({type:'build',kind:'barracks',x:200,z:210});
    let id=0;
    for(let tick=1;tick<=3200;tick++){
      if(tick===1500){
        id=worlds[0]!.settlement!.buildings.find(b=>b.kind==='barracks')!.id;
        peers[0]!.send({type:'recruit',id,kind:'warrior'});
        peers[0]!.send({type:'recruit',id,kind:'archer'});
        peers[0]!.send({type:'cancel-recruit',id,index:1});
        peers[0]!.send({type:'rally',id,x:210,z:222});
        const soldier=worlds[0]!.settlement!.workers.find(w=>w.owner===0&&w.role==='warrior')!;
        peers[0]!.send({type:'move-units',ids:[soldier.id],x:215,z:223,attackMove:true});
      }
      peers[tick%2]!.confirm(tick);peers[1-tick%2]!.confirm(tick);
      for(let i=0;i<2;i++)apply(worlds[i]!,peers[i]!.take(tick)!);
      if(tick%80===0)expect(worlds[0]!.checksum()).toBe(worlds[1]!.checksum());
    }
    expect(worlds[0]!.settlement!.workers.filter(w=>w.owner===0&&w.role==='warrior')).toHaveLength(3);
    expect(worlds[0]!.settlement!.buildings.find(b=>b.id===id)!.queue).toEqual([]);
    channels.forEach(c=>c.destroy());
  });
  it("rejects malformed packets atomically and ignores replayed confirmations", () => {
    const room = new Room(config);
    const action: Action = { type: "build", kind: "house", x: 210, z: 210 };
    room.confirm(0, 1, [
      {
        tick: 1,
        actions: [
          { type: "build", kind: "bogus", x: 210, z: 210 } as unknown as Action,
        ],
      },
    ]);
    room.confirm(1, 1, []);
    expect(room.tick).toBe(0);
    room.confirm(0, 1, [{ tick: 1, actions: [action] }]);
    expect(room.tick).toBe(1);
    room.confirm(0, 1, [{ tick: 2, actions: [action] }]);
    room.confirm(0, 2, []);
    room.confirm(1, 2, []);
    expect(room.snapshot().held).toEqual([]);
  });
});
