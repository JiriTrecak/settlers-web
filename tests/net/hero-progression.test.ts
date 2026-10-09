import {expect,it} from 'vitest';
import {Room,Lockstep,MemoryChannel} from '../../src/net';
import {localMatch} from '../../src/shared/match/match';
import {ContentRegistry} from '../../src/content/registry';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {source,placed,slots} from '../game/helpers';

it('replicates learned ultimate ranks, delayed casts, kills and XP across a cold peer restore',()=>{
 const data=source(),registry=new ContentRegistry(data);
 const map={...emptyUtcMap(),sandbox:true,entities:[placed('marshal','unit.ants.marshal',120,120),{...placed('enemy','unit.ants.warrior',128,120),owner:'player.2' as const}]};
 const make=()=>new Game(map,slots,registry,42),games=[make(),make()];
 for(const g of games){const h=g.entities.find(e=>e.placement==='marshal')!;h.progression!.experience=2800;h.rotation=90;g.entities.find(e=>e.placement==='enemy')!.hp=200;g.observation.update();}
 const hero=games[0].entities.find(e=>e.placement==='marshal')!.id;
 const config={...localMatch({mapId:'hero-test',mapRevision:'hero-test',seed:42,slotCount:2,me:0,delay:3}),slots};
 const room=new Room(config),channels=[new MemoryChannel(room,0),new MemoryChannel(room,1)],peers=channels.map((c,i)=>new Lockstep(c,i,3));
 try{
  peers[0].send({type:'learnAbility',actor:hero,ability:'crownfall'});
  peers[0].send({type:'learnAbility',actor:hero,ability:'crownfall'});
  for(let tick=1;tick<=100;tick++){
   if(tick===8)peers[0].send({type:'castAbility',actor:hero,binding:'crownfall',target:{kind:'point',position:{x:128,y:120}}});
   peers[tick%2].confirm(tick);peers[1-tick%2].confirm(tick);
   for(let i=0;i<2;i++){
    const commit=peers[i].take(tick)!;expect(commit).toBeDefined();
    for(const slot of commit.slots)for(const action of slot.actions)expect(games[i].command(`player.${slot.player+1}` as 'player.1'|'player.2',action).accepted).toBe(true);
    games[i].tick();
   }
   if(tick===20){const cold=make();cold.restore(JSON.parse(JSON.stringify(games[1].snapshot())));games[1]=cold;}
   expect(games[0].checksum('full')).toBe(games[1].checksum('full'));
  }
  const h=games[0].context.get(hero)!;
  expect(h.abilities!.ranks.crownfall).toBe(2);expect(h.progression!.experience).toBe(2824);
  expect(games[0].entities.some(e=>e.placement==='enemy')).toBe(false);
  expect(games[0].snapshot()).toEqual(games[1].snapshot());
 }finally{channels.forEach(c=>c.destroy());}
});
