import {expect,it} from 'vitest';
import {Room,Lockstep,MemoryChannel} from '../../src/net';
import {World} from '../../src/sim/world/world';
import {localMatch} from '../../src/shared';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';

it('consumes enemy corpses and expires the complete published reanimated army across delayed peers and restores',()=>{
 const ability=coreAbilities.abilities.find(a=>a.id==='ability.core.animate-dead')!,presentation=coreAbilities.presentations.find(p=>p.id===ability.presentation)!;
 const f=createAbilityEncounter(ability,presentation,encounterSettingsSchema.parse({relationship:'enemy',fallenTargets:true,targetCount:3,distance:4,mana:1000}),false);
 const corpses=f.game.state.corpses.map(c=>c.id),opts={map:f.game.map,slots:f.game.slots,registry:f.game.registry,seed:42};
 const worlds=[new World(opts),new World(opts)];for(const w of worlds)w.settlement.restore(f.game.snapshot());
 const room=new Room({...localMatch({mapId:'reanimation-lifetime',mapRevision:'test',seed:42,slotCount:2,me:0,delay:3}),slots:[...f.game.slots]});
 const channels=[new MemoryChannel(room,0),new MemoryChannel(room,1)],peers=channels.map((c,i)=>new Lockstep(c,i,3));
 peers[0].send({type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'unit',entity:f.caster}});
 let expires=0,created:number[]=[];const restored:number[]=[];
 const restore=(tick:number)=>{const snapshot=JSON.parse(JSON.stringify(worlds[1].snapshot()));worlds[1]=new World(opts);worlds[1].restore(snapshot);restored.push(tick);};
 try{
  for(let tick=1;tick<=1650;tick++){
   peers[tick%2].confirm(tick);peers[1-tick%2].confirm(tick);
   for(let i=0;i<2;i++){
    const commit=peers[i].take(tick)!;expect(commit).toBeTruthy();
    for(const slot of commit.slots)slot.actions.forEach((action,seq)=>worlds[i].enqueue(action,commit.tick,{player:slot.player,seq}));worlds[i].tick();
   }
   const game=worlds[0].settlement,army=game.entities.filter(e=>e.summoned?.reanimatedFrom!==undefined);
   if(army.length&&!created.length){
    created=army.map(e=>e.id);expires=army[0].summoned!.expires;
    expect(army.map(e=>e.summoned!.reanimatedFrom).sort()).toEqual([...corpses].sort());expect(game.state.corpses).toHaveLength(0);
    expect(army.every(e=>e.owner==='player.1')).toBe(true);expect(expires-army[0].summoned!.started).toBe(1600);
    expect(game.context.get(f.caster)!.abilities!.mana).toBe(825);
    restore(tick);
   }
   if(created.length&&tick<expires){expect(army.map(e=>e.id)).toEqual(created);expect(army.every(e=>e.spellStatuses?.length===2&&e.spellStatuses.every(s=>s.expires===expires))).toBe(true);}
   if(expires&&tick>=expires){expect(army).toHaveLength(0);expect(game.state.corpses).toHaveLength(0);expect(created.every(id=>!game.context.get(id))).toBe(true);}
   if(tick===3||expires&&[expires-1,expires,expires+1].includes(tick))restore(tick);
   expect(worlds[1].checksum(),`tick ${tick}`).toBe(worlds[0].checksum());
  }
  expect(created).toHaveLength(3);expect(expires).toBeGreaterThan(1600);expect(restored).toContain(expires-1);expect(restored).toContain(expires);expect(restored).toContain(expires+1);
 }finally{channels.forEach(c=>c.destroy());}
},20000);
