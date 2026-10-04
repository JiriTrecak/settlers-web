import {expect,it} from 'vitest';
import {Room,Lockstep,MemoryChannel} from '../../src/net';
import {World} from '../../src/sim/world/world';
import {localMatch} from '../../src/shared';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';

it.each([false,true])('replays absorption pool and lifecycle with combat=%s across delayed peers',combat=>{
 const ability=coreAbilities.abilities.find(a=>a.id==='ability.core.absorption-shield')!;
 const presentation=coreAbilities.presentations.find(p=>p.id===ability.presentation)!;
 const f=createAbilityEncounter(ability,presentation,encounterSettingsSchema.parse({relationship:'enemy',combat,targetCount:3,targetSpacing:2,distance:2,casterHealth:500,targetHealth:500,mana:1000}));
 const opts={map:f.game.map,slots:f.game.slots,registry:f.game.registry,seed:42};
 const worlds=[new World(opts),new World(opts)];for(const world of worlds)world.settlement.restore(f.game.snapshot());
 const room=new Room({...localMatch({mapId:'shield-lifecycle',mapRevision:'test',seed:42,slotCount:2,me:0,delay:3}),slots:[...f.game.slots]});
 const channels=[new MemoryChannel(room,0),new MemoryChannel(room,1)],peers=channels.map((c,i)=>new Lockstep(c,i,3));
 peers[0].send({type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'unit',entity:f.caster}});
 let applied=false,partial=false,depleted=false,expired=false,lossAfterPool=false,expires=0,previous:{pool:number;hp:number}|undefined;
 const restore=()=>{const saved=JSON.parse(JSON.stringify(worlds[1].snapshot()));worlds[1]=new World(opts);worlds[1].restore(saved);};
 try{for(let tick=1;tick<=450;tick++){
  peers[tick%2].confirm(tick);peers[1-tick%2].confirm(tick);
  for(let i=0;i<2;i++){
   const commit=peers[i].take(tick)!;expect(commit).toBeTruthy();
   for(const slot of commit.slots)slot.actions.forEach((action,seq)=>worlds[i].enqueue(action,commit.tick,{player:slot.player,seq}));worlds[i].tick();
  }
  const caster=worlds[0].settlement.context.get(f.caster)!,status=caster?.spellStatuses?.find(s=>s.ability===ability.id);
  if(status){
   if(!applied){expect(status.shield).toBe(150);applied=true;expires=status.expires;}
   const pool=status.shield!;
   if(previous&&pool>0){expect(pool).toBeLessThanOrEqual(previous.pool);expect(caster.hp).toBe(previous.hp);}
   if(pool>0&&pool<150&&!partial){partial=true;restore();}
   previous={pool,hp:caster.hp!};
  }else if(applied&&!combat){expect(caster.hp).toBe(500);expect(tick).toBeGreaterThanOrEqual(expires);expired=true;}
  else if(applied&&combat&&caster){
   if(!depleted){expect(tick).toBeLessThan(expires);expect(partial).toBe(true);depleted=true;restore();}
   if(previous?.pool===0&&caster.hp!<previous.hp)lossAfterPool=true;
   previous={pool:0,hp:caster.hp!};
  }
  if([3,18,410].includes(tick))restore();
  expect(worlds[1].checksum(),`tick ${tick}`).toBe(worlds[0].checksum());
 }
 expect(applied).toBe(true);
 if(combat){expect(partial).toBe(true);expect(depleted).toBe(true);expect(lossAfterPool).toBe(true);}
 else{expect(partial).toBe(false);expect(expired).toBe(true);expect(worlds[0].settlement.context.get(f.caster)!.abilities!.mana).toBe(960);}
 }finally{channels.forEach(c=>c.destroy());}
},20000);
