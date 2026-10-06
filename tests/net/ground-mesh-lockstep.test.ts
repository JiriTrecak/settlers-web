import {expect,it} from 'vitest';
import {Room,Lockstep,MemoryChannel} from '../../src/net';
import {World} from '../../src/sim/world/world';
import {emptyUtcMap,localMatch,type Commit} from '../../src/shared';
import {placed,slots} from '../game/helpers';

it('replicates mesh and conservative fallback routing across peers and a cold restore',()=>{
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
  for(let tick=1;tick<=640;tick++){
   if(tick===100){const restored=new World(options);restored.restore(JSON.parse(JSON.stringify(worlds[1]!.snapshot())));worlds[1]=restored;}
   // Cross the obstacle again after both peers reach the far side. With the
   // calibrated speed, the earlier mid-route retarget can be a direct shortcut.
   if(tick===360)peers[0]!.send({type:'move',actors:[actor],destination:{x:70,y:110}});
   peers[tick%2]!.confirm(tick);peers[1-tick%2]!.confirm(tick);
   for(let i=0;i<2;i++)apply(worlds[i]!,peers[i]!.take(tick)!);
   if(tick%20===0)expect(worlds[0]!.checksum('full')).toBe(worlds[1]!.checksum('full'));
  }
    expect(worlds[0]!.settlement.spatial.routing.meshAccepted).toBeGreaterThan(0);
  for(const world of worlds){
   const routing=world.settlement.spatial.routing;
   // Wide-body raster clearance may legitimately require the grid fallback.
   // Both caches must attempt the mesh and preserve authoritative results.
   expect(routing.meshSearches).toBeGreaterThan(0);
   expect(routing.meshAccepted+routing.meshFallbacks).toBe(routing.meshSearches);
  }
  expect(worlds[0]!.snapshot()).toEqual(worlds[1]!.snapshot());
 }finally{for(const c of channels)c.destroy();}
});
