import {expect,it} from 'vitest';
import {Room,Lockstep,MemoryChannel} from '../../src/net';
import {World} from '../../src/sim/world/world';
import {localMatch} from '../../src/shared';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';

it.each([
 {name:'vampiric-aura',stat:'lifestealPermille' as const,amount:150},
 {name:'thorns-aura',stat:'meleeReflectionPermille' as const,amount:200},
])('$name reconstructs recipient membership through delayed movement, source death and peer restoration',({name,stat,amount})=>{
 const ability=coreAbilities.abilities.find(a=>a.id==='ability.core.'+name)!,presentation=coreAbilities.presentations.find(p=>p.id===ability.presentation)!;
 const f=createAbilityEncounter(ability,presentation,encounterSettingsSchema.parse({relationship:'ally',combat:true,distance:6,casterHealth:1,targetHealth:500}));
 const enemy=f.game.context.create({id:'hunter',definition:'unit.preview.target',owner:'player.2',position:{x:150,y:140},rotation:270});
 const opts={map:f.game.map,slots:f.game.slots,registry:f.game.registry,seed:42};
 const worlds=[new World(opts),new World(opts)];for(const w of worlds)w.settlement.restore(f.game.snapshot());
 const room=new Room({...localMatch({mapId:'aura-membership',mapRevision:'test',seed:42,slotCount:2,me:0,delay:3}),slots:[...f.game.slots]});
 const channels=[new MemoryChannel(room,0),new MemoryChannel(room,1)],peers=channels.map((c,i)=>new Lockstep(c,i,3));
 let left=false,returned=false,lostSource=false,deathTick=0;
 try{
  for(let tick=1;tick<=650;tick++){
   if(tick===5)peers[0].send({type:'move',actors:[f.target],destination:{x:142,y:120}});
   if(tick===180)peers[0].send({type:'move',actors:[f.target],destination:{x:126,y:120}});
   if(tick===350)peers[1].send({type:'move',actors:[enemy.id],destination:{x:121,y:121}});
   if(tick===500)peers[1].send({type:'attack',actors:[enemy.id],target:f.caster});
   peers[tick%2].confirm(tick);peers[1-tick%2].confirm(tick);
   for(let i=0;i<2;i++){
    const commit=peers[i].take(tick)!;expect(commit).toBeTruthy();
    for(const slot of commit.slots)slot.actions.forEach((action,seq)=>worlds[i].enqueue(action,commit.tick,{player:slot.player,seq}));worlds[i].tick();
   }
   const game=worlds[0].settlement,recipient=game.context.get(f.target)!;
   expect(recipient?.hp).toBeGreaterThan(0);
   if(tick===1)expect(game.context.stats(recipient)[stat]).toBe(amount);
   if(tick>5&&tick<180&&game.context.stats(recipient)[stat]===0)left=true;
   if(tick>180&&tick<350&&game.context.stats(recipient)[stat]===amount)returned=true;
   if(!game.context.get(f.caster)&&!deathTick)deathTick=tick;
   if(deathTick&&tick>deathTick){expect(game.context.stats(recipient)[stat]).toBe(0);expect(recipient.spellStatuses?.some(s=>s.ability===ability.id)).toBeFalsy();lostSource=true;}
   if([3,100,250].includes(tick)||tick===deathTick||deathTick&&tick===deathTick+1){const saved=JSON.parse(JSON.stringify(worlds[1].snapshot()));worlds[1]=new World(opts);worlds[1].restore(saved);}
   expect(worlds[1].checksum(),`tick ${tick}`).toBe(worlds[0].checksum());
  }
  expect(left).toBe(true);expect(returned).toBe(true);expect(lostSource).toBe(true);
 }finally{channels.forEach(c=>c.destroy());}
});
