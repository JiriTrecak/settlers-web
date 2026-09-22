import '../fixtures/walkableCatalogue';
import {expect,it} from 'vitest';
import {Room,Lockstep,MemoryChannel} from '../../src/net';
import {World} from '../../src/sim/world/world';
import {emptyUtcMap,localMatch,type Commit} from '../../src/shared';
import {placed,slots} from '../game/helpers';
import {precise} from '../../src/sim/game/motion';

it('keeps two peers identical through over/under movement, a mid-climb restore, fog and downhill arrows',()=>{
 const base=emptyUtcMap(),map={...base,
  playerStarts:base.playerStarts.map((s,i)=>({...s,x:200,z:i?80:200})),
  stamps:[{id:'root',asset:'leafbound-twig-bridge',x:40,y:40}],
  entities:[placed('climber','unit.ants.archer',40,26),placed('underpass','unit.ants.warrior',30,40),
   {...placed('defender','unit.ants.marshal',49,40),owner:'player.2' as const}],
 };
 const config={...localMatch({mapId:'layered-lockstep',mapRevision:'test',seed:4,slotCount:2,me:0,delay:3}),slots};
 const room=new Room(config),channels=slots.map(s=>new MemoryChannel(room,s.player)),peers=channels.map((c,i)=>new Lockstep(c,i,3));
 const opts={map,slots,seed:4},worlds=[new World(opts),new World(opts)];
 const find=(world:World,tag:string)=>world.settlement.entities.find(e=>e.placement===tag)!;
 const archer=find(worlds[0]!,'climber').id,lower=find(worlds[0]!,'underpass').id,enemy=find(worlds[0]!,'defender').id;
 const initialHp=find(worlds[0]!,'defender').hp!;
 const apply=(world:World,commit:Commit)=>{
  for(const slot of commit.slots)slot.actions.forEach((a,seq)=>world.enqueue(a,commit.tick,{player:slot.player,seq}));
  world.tick();
 };
 let restored=false,shotFromDeck=false,observedSeparation=false,walkedBelowDeck=false;
 peers[0]!.send({type:'move',actors:[archer],destination:{x:42,y:40,surface:'root'}});
 peers[0]!.send({type:'move',actors:[lower],destination:{x:50,y:40}});
 peers[0]!.send({type:'move',actors:[lower],destination:{x:50,y:24},append:true});
 peers[1]!.send({type:'hold',actors:[enemy]});
 try{
  for(let tick=1;tick<=1100;tick++){
   if(tick===500){
    const a=find(worlds[0]!,'climber');expect(a.surface).toBe('root');
    expect(precise(a).x).toBe(42);
    // The lower unit crossed beneath the same root while the archer climbed.
    expect(find(worlds[0]!,'underpass').surface).toBeUndefined();
    peers[0]!.send({type:'attack',actors:[archer],target:enemy});
   }
   // Alternate receipt order to avoid depending on one peer's delivery order.
   peers[tick%2]!.confirm(tick);peers[1-tick%2]!.confirm(tick);
   for(let i=0;i<2;i++)apply(worlds[i]!,peers[i]!.take(tick)!);
   const g=worlds[0]!.settlement,a=find(worlds[0]!,'climber');
   const below=precise(find(worlds[0]!,'underpass'));
   if(!below.surface&&Math.abs(below.x-40)<1&&Math.abs(below.y-40)<1)walkedBelowDeck=true;
   if(!restored&&a.surface==='root'&&a.unit!.route.length>0){
    const saved=JSON.parse(JSON.stringify(worlds[1]!.snapshot()));
    const resumed=new World(opts);resumed.restore(saved);worlds[1]=resumed;restored=true;
   }
   if(g.state.missiles.some(m=>m.origin.surface==='root'&&!m.destination.surface))shotFromDeck=true;
   const defender=find(worlds[0]!,'defender');
   if(defender&&a.surface==='root'&&g.observation.visible('player.1',defender)&&!g.observation.visible('player.2',a))observedSeparation=true;
   if(tick%25===0){
    expect(worlds[1]!.checksum(),`peer checksum at ${tick}`).toBe(worlds[0]!.checksum());
    for(const player of [0,1])expect(worlds[1]!.view(player).settlement.fog!.floors!.cells).toEqual(worlds[0]!.view(player).settlement.fog!.floors!.cells);
   }
  }
  expect(restored).toBe(true);expect(shotFromDeck).toBe(true);expect(observedSeparation).toBe(true);expect(walkedBelowDeck).toBe(true);
  expect(precise(find(worlds[0]!,'underpass'))).toEqual({x:50,y:24});
  expect(find(worlds[0]!,'defender')?.hp??0).toBeLessThan(initialHp);
 }finally{channels.forEach(c=>c.destroy());}
},20000);
