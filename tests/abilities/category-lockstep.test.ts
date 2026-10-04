import {expect,it} from 'vitest';
import {Room,Lockstep,MemoryChannel} from '../../src/net';
import {World} from '../../src/sim/world/world';
import {localMatch} from '../../src/shared';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema,type EncounterSettings} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';

type Scenario={name:string;id?:string;ticks?:number;event:string;status?:string;healing?:number[];damage?:number;armorBonus?:number;settings?:Partial<EncounterSettings>};
// Published content runs unchanged through real network commits, not direct interpreter calls.
const scenarios:Scenario[]=[
 {name:'holy-light-lite',event:'healed',settings:{relationship:'ally',targetHealth:100}},
 {name:'holy-light',event:'healed',settings:{relationship:'ally',targetHealth:100}},
 {name:'death-coil',event:'damaged',settings:{targetNature:'organic'}},
 {name:'storm-bolt',event:'damaged'},
 {name:'blizzard',event:'wave',settings:{targetCount:4}},
 {name:'shockwave',event:'damaged'},
 {name:'chain-lightning',event:'damaged',settings:{targetCount:4}},
 {name:'healing-wave',event:'healed',settings:{relationship:'ally',targetCount:4,targetHealth:100}},
 {name:'entangling-roots',event:'statusApplied'},
 {name:'absorption-shield',event:'statusApplied',settings:{relationship:'ally'}},
 {name:'unstoppable',event:'statusApplied',settings:{relationship:'ally',initialStatuses:['ability.core.entangling-roots']}},
 {name:'dispel-magic',event:'dispelled',settings:{relationship:'ally',initialStatuses:['ability.core.entangling-roots']}},
 {name:'life-drain',event:'drained',settings:{casterHealth:100}},
 {name:'flame-strike',event:'damaged'},
 {name:'immolation',event:'damaged',settings:{distance:2}},
 {name:'mana-shield',event:'statusApplied'},
 {name:'blink',event:'teleported'},
 {name:'far-sight',event:'visionCreated'},
 {name:'wind-walk',event:'statusApplied'},
 {name:'true-sight',event:'statusApplied',status:'detector'},
 {name:'avatar',event:'statusApplied'},
 {name:'metamorphosis',event:'statusApplied'},
 {name:'banish',event:'statusApplied'},
 {name:'spell-ward',event:'statusApplied',settings:{relationship:'ally'}},
 {name:'flight-form',event:'statusApplied'},
 {name:'web',event:'statusApplied',settings:{targetLocomotion:'air'}},
 {name:'feral-spirit',event:'summoned'},
 {name:'spirit-companion',event:'summoned'},
 {name:'raise-dead',event:'summoned',settings:{relationship:'ally',fallenTargets:true,targetCount:3}},
 {name:'resurrection',event:'resurrected',settings:{relationship:'ally',fallenTargets:true,targetCount:3}},
 {name:'animate-dead',event:'resurrected',settings:{relationship:'ally',fallenTargets:true,targetCount:3}},
 {name:'charm',event:'converted'},
 {name:'devour',event:'contained',settings:{distance:3}},
 {name:'death-and-decay',event:'damaged'},
 {name:'grove-nursery',event:'interval'},
 {name:'spirit-swarm',event:'returned',settings:{casterHealth:100,distance:4}},
 {name:'spirit-trinity',event:'splitStarted'},
 {name:'critical-strike',event:'criticalStrike',settings:{combat:true,distance:2}},
 {name:'evasion',event:'evaded',settings:{combat:true,distance:2}},
 {name:'cleaving-attack',event:'cleaved',settings:{combat:true,distance:2,targetCount:4,targetSpacing:1}},
 {name:'bash',event:'statusApplied',settings:{combat:true,distance:2}},
 {name:'battle-rhythm',event:'statusApplied',settings:{combat:true,distance:2}},
 {name:'searing-arrows',event:'enhancedHit',settings:{combat:true,casterDefinition:'unit.ants.archer',distance:8}},
 {name:'frost-arrows',event:'statusApplied',settings:{combat:true,casterDefinition:'unit.ants.archer',distance:8}},
 {name:'black-arrow',event:'summoned',settings:{combat:true,casterDefinition:'unit.ants.archer',distance:8,targetHealth:25}},
 {name:'death-burst',event:'damaged',settings:{combat:true,distance:2,casterHealth:10}},
 {name:'soul-harvest',event:'healed',settings:{combat:true,distance:2,casterHealth:100,targetHealth:10}},
 {name:'reincarnation',ticks:400,event:'revived',settings:{combat:true,distance:2,casterHero:true,casterHealth:10}},
 {name:'rallying-spark',id:'ability.custom.rallying-spark',event:'healed',healing:[100,75,56,42],armorBonus:2,settings:{relationship:'ally',targetCount:4,targetHealth:100}},
 {name:'ashstep',id:'ability.custom.ashstep',event:'damaged',damage:70,settings:{targetCount:3}},
];
it.each(scenarios)('$name agrees across delayed peers and JSON save/restore at three lifecycle boundaries',({name,id,event,status,settings,ticks=300,healing,damage,armorBonus})=>{
 const a=coreAbilities.abilities.find(a=>a.id===(id??'ability.core.'+name))!,p=coreAbilities.presentations.find(p=>p.id===a.presentation)!;
 const f=createAbilityEncounter(a,p,encounterSettingsSchema.parse({relationship:'enemy',targetHealth:500,mana:1000,distance:6,...settings}));
 const opts={map:f.game.map,slots:f.game.slots,registry:f.game.registry,seed:42};
 const worlds=[new World(opts),new World(opts)];for(const world of worlds)world.settlement.restore(f.game.snapshot());
 const config={...localMatch({mapId:'spell-category',mapRevision:'test',seed:42,slotCount:2,me:0,delay:3}),slots:[...f.game.slots]};
 const room=new Room(config),channels=[new MemoryChannel(room,0),new MemoryChannel(room,1)],peers=channels.map((c,i)=>new Lockstep(c,i,3));
 if(a.activation!=='passive')peers[0].send({type:'castAbility',actor:f.caster,binding:'preview',target:a.targeting.kind==='point'?{kind:'point',position:{x:126,y:120}}:{kind:'unit',entity:a.targeting.kind==='self'?f.caster:f.target!}});
 let exercised=false;const heals=new Map<number,number>(),warded=new Set<number>(),baseArmor=new Map(f.game.entities.map(e=>[e.id,f.game.context.stats(e).armor]));
 try{for(let tick=1;tick<=ticks;tick++){
  peers[tick%2].confirm(tick);peers[1-tick%2].confirm(tick);
  for(let i=0;i<2;i++){
   const commit=peers[i].take(tick)!;expect(commit).toBeTruthy();
   for(const slot of commit.slots)slot.actions.forEach((action,seq)=>worlds[i].enqueue(action,commit.tick,{player:slot.player,seq}));worlds[i].tick();
  }
  exercised ||= status?worlds[0].settlement.entities.some(e=>e.spellStatuses?.some(s=>s.ability===a.id&&s.status===status)):worlds[0].settlement.abilities.observedEvents().some(e=>e.ability===a.id&&e.event===event);
  if(healing)for(const e of worlds[0].settlement.abilities.observedEvents())if(e.ability===a.id&&e.event==='healed')heals.set(e.id,e.amount!);
  if(damage!==undefined)for(const e of worlds[0].settlement.abilities.observedEvents())if(e.ability===a.id&&e.event==='damaged')expect(e.amount).toBe(damage);
  if(armorBonus!==undefined)for(const e of worlds[0].settlement.entities)if(e.spellStatuses?.some(s=>s.ability===a.id)){
   warded.add(e.id);expect(worlds[0].settlement.context.stats(e).armor).toBe(baseArmor.get(e.id)!+armorBonus);
  }
  if([3,18,110].includes(tick)){const snapshot=JSON.parse(JSON.stringify(worlds[1].snapshot()));worlds[1]=new World(opts);worlds[1].restore(snapshot);}
  expect(worlds[1].checksum(),`tick ${tick}`).toBe(worlds[0].checksum());
  // Runtime fingerprints deliberately sample; correctness proofs still compare
  // complete state, including spell internals and hidden knowledge.
  expect(worlds[1].checksum('full'),`full audit at tick ${tick}`).toBe(worlds[0].checksum('full'));
 }
 expect(exercised,`${name} must actually produce ${event}; agreement alone is insufficient`).toBe(true);
 if(healing)expect([...heals.values()]).toEqual(healing);
 if(armorBonus!==undefined){expect(warded.size).toBe(healing?.length);for(const e of worlds[0].settlement.entities)expect(worlds[0].settlement.context.stats(e).armor).toBe(baseArmor.get(e.id));}
 }finally{channels.forEach(c=>c.destroy());}
},20000);
