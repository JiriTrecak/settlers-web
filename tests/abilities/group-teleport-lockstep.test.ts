import {expect,it} from 'vitest';
import {Room,Lockstep,MemoryChannel} from '../../src/net';
import {World} from '../../src/sim/world/world';
import {localMatch} from '../../src/shared';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import type {AbilityEvent} from '../../src/sim/abilities/runtime';

it('transports the actual allied group through lockstep, preserving exclusions, costs and restore boundaries',()=>{
 const ability=coreAbilities.abilities.find(a=>a.id==='ability.core.mass-teleport')!;
 const presentation=coreAbilities.presentations.find(p=>p.id===ability.presentation)!;
 const f=createAbilityEncounter(ability,presentation,encounterSettingsSchema.parse({relationship:'ally',targetCount:3,distance:3,targetSpacing:2,mana:1000,targetHealth:400}));
 const passengers=f.game.entities.map(e=>({id:e.id,x:e.x,y:e.y,hp:e.hp}));
 const add=(id:string,owner:'player.1'|'player.2',x:number,y:number)=>f.game.context.create({id,definition:'unit.preview.target',owner,position:{x,y},rotation:0});
 const anchor=add('remote-anchor','player.1',160,120),outsider=add('outside-radius','player.1',134,120),enemy=add('nearby-enemy','player.2',118,120);
 f.game.observation.update();
 const opts={map:f.game.map,slots:f.game.slots,registry:f.game.registry,seed:42};
 const worlds=[new World(opts),new World(opts)];for(const world of worlds)world.settlement.restore(f.game.snapshot());
 const room=new Room({...localMatch({mapId:'group-teleport',mapRevision:'test',seed:42,slotCount:2,me:0,delay:3}),slots:[...f.game.slots]});
 const channels=[new MemoryChannel(room,0),new MemoryChannel(room,1)],peers=channels.map((c,i)=>new Lockstep(c,i,3));
 const moves=new Map<number,AbilityEvent>();
 peers[0].send({type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'unit',entity:anchor.id}});
 try{
  for(let tick=1;tick<=150;tick++){
   peers[tick%2].confirm(tick);peers[1-tick%2].confirm(tick);
   for(let i=0;i<2;i++){
    const commit=peers[i].take(tick)!;expect(commit).toBeTruthy();
    for(const slot of commit.slots)slot.actions.forEach((action,seq)=>worlds[i].enqueue(action,commit.tick,{player:slot.player,seq}));worlds[i].tick();
   }
   for(const event of worlds[0].settlement.abilities.observedEvents())if(event.ability===ability.id&&event.event==='teleported')moves.set(event.target,event);
   if([3,110,130].includes(tick)){const saved=JSON.parse(JSON.stringify(worlds[1].snapshot()));worlds[1]=new World(opts);worlds[1].restore(saved);}
   expect(worlds[1].checksum(),`tick ${tick}`).toBe(worlds[0].checksum());
  }
  expect([...moves.keys()].sort((a,b)=>a-b)).toEqual(passengers.map(e=>e.id).sort((a,b)=>a-b));
  const game=worlds[0].settlement,positions=new Set<string>();
  for(const before of passengers){
   const after=game.context.get(before.id)!,event=moves.get(before.id)!;
   expect(after.hp).toBe(before.hp);expect(after.owner).toBe('player.1');
   // Formation offset is relative to the original caster, even after that caster moves first.
   expect(Math.abs(after.x-(anchor.x+before.x-120))+Math.abs(after.y-(anchor.y+before.y-120))).toBeLessThanOrEqual(8);
   expect(after.x).toBeGreaterThan(150);expect(event.origin).toMatchObject({x:before.x,y:before.y});
   expect(event.point).toMatchObject({x:after.x,y:after.y});positions.add(`${after.x},${after.y}`);
  }
  expect(positions.size).toBe(passengers.length);
  for(const original of [anchor,outsider,enemy])expect(game.context.get(original.id)).toMatchObject({x:original.x,y:original.y,owner:original.owner});
  const caster=game.context.get(f.caster)!;
  expect(caster.abilities!.mana).toBe(975);expect(caster.abilities!.cooldowns[ability.id]).toBe(moves.get(f.caster)!.tick+200);
 }finally{channels.forEach(c=>c.destroy());}
},20000);
