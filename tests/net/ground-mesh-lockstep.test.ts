import {expect,it} from 'vitest';
import {Room,Lockstep,MemoryChannel} from '../../src/net';
import {World} from '../../src/sim/world/world';
import {emptyUtcMap,localMatch,type Commit} from '../../src/shared';
import {placed,slots} from '../game/helpers';

it('replicates mesh-driven orders across peers and a cold mid-route restore',()=>{
 const map={...emptyUtcMap(),entities:[placed('walker','unit.ants.warrior',70,110),placed('obstacle','building.ants.house',110,110)]};
 const config={...localMatch({mapId:'mesh-lockstep',mapRevision:'test',seed:4,slotCount:2,me:0,delay:3}),slots};
 const room=new Room(config),channels=slots.map(s=>new MemoryChannel(room,s.player)),peers=channels.map((c,i)=>new Lockstep(c,i,3));
 const options={map,slots,seed:4},worlds=[new World(options),new World(options)];
 const actor=worlds[0]!.settlement.entities.find(e=>e.placement==='walker')!.id;
 const apply=(world:World,commit:Commit)=>{
  for(const slot of commit.slots)slot.actions.forEach((action,seq)=>world.enqueue(action,commit.tick,{player:slot.player,seq}));
  world.tick();
 };
 const s=worlds[0]!.settlement.spatial;
 for(let i=0;i<10;i++)s.findPath(s.cell({x:70,y:100+i}),s.cell({x:160,y:115}));
 peers[0]!.send({type:'move',actors:[actor],destination:{x:160,y:110}});
 try{
  for(let tick=1;tick<=240;tick++){
   if(tick===100){const restored=new World(options);restored.restore(JSON.parse(JSON.stringify(worlds[1]!.snapshot())));worlds[1]=restored;}
   if(tick===120)peers[0]!.send({type:'move',actors:[actor],destination:{x:160,y:100}});
   peers[tick%2]!.confirm(tick);peers[1-tick%2]!.confirm(tick);
   for(let i=0;i<2;i++)apply(worlds[i]!,peers[i]!.take(tick)!);
   if(tick%20===0)expect(worlds[0]!.checksum('full')).toBe(worlds[1]!.checksum('full'));
  }
  for(const world of worlds)expect(world.settlement.spatial.routing.meshAccepted).toBeGreaterThan(0);
  expect(worlds[0]!.snapshot()).toEqual(worlds[1]!.snapshot());
 }finally{for(const c of channels)c.destroy();}
});
