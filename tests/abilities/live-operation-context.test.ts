import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,type Effect} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {abilityAimScore} from '../../src/sim/abilities/ai';
import {Room,Lockstep,MemoryChannel} from '../../src/net';
import {World} from '../../src/sim/world/world';
import {localMatch} from '../../src/shared';

const base=coreAbilities.abilities.find(a=>a.id==='ability.core.blink')!;
const presentation=coreAbilities.presentations.find(p=>p.id===base.presentation)!;
const blink=base.onRelease[0] as Effect;
const query=(center:'caster'|'target'|'point')=>({center,radius:4,relations:['enemy'],allowSelf:false,includeBuildings:false,excludePrimary:true,maxTargets:8,order:'nearest'} as const);
const burst=(center:'caster'|'target'|'point')=>({op:'damage',target:'target',amount:70,damageType:'spell',query:query(center)});
function fixture(ops:unknown[],patch={},settings={}){
 const a=abilitySchema.parse({...base,onRelease:ops,...patch});
 const f=createAbilityEncounter(a,presentation,encounterSettingsSchema.parse({relationship:'enemy',targetHealth:500,distance:12,mana:1000,...settings}));
 return {...f,a,c:()=>f.game.context.get(f.caster)!,t:()=>f.game.context.get(f.target)!};
}
function step(f:ReturnType<typeof fixture>,n=30){for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});}
function enemy(f:ReturnType<typeof fixture>,id:string,x:number,y=120){return f.game.context.create({id,definition:'unit.ants.warrior',owner:'player.2',position:{x,y},rotation:0});}

it('selects a caster-centered follow-up at the actual landing location and replays it',()=>{
 const f=fixture([blink,burst('caster')]),copy=fixture([blink,burst('caster')]),departure=enemy(f,'departure',122);
 const before=departure.hp;f.game.observation.update();expect(f.game.abilities.cast(f.caster,'preview',{x:132,y:120})).toBeNull();step(f,2);
 copy.game.restore(JSON.parse(JSON.stringify(f.game.snapshot())));
 for(let i=0;i<30;i++){step(f,1);step(copy,1);expect(f.game.checksum()).toBe(copy.game.checksum());}
 expect(f.c().x).toBeGreaterThan(128);expect(f.t().hp).toBe(430);expect(departure.hp).toBe(before);
 expect(f.game.abilities.observedEvents().find(e=>e.event==='damaged')?.origin).toMatchObject({x:f.c().x,y:f.c().y});
});
it('resolves a later teleport destination at the moved target instead of its old point',()=>{
 const f=fixture([{...blink,target:'target',destination:'caster'},{...blink,target:'caster',destination:'target'}],{targeting:{...base.targeting,kind:'unit',relations:['enemy'],radius:undefined}});
 expect(f.game.abilities.cast(f.caster,'preview',f.target!)).toBeNull();step(f);
 expect(f.t().x).toBeLessThan(124);expect(f.c().x).toBeLessThan(124);
 expect(f.game.abilities.observedEvents().filter(e=>e.event==='teleported')).toHaveLength(2);
});
it.each(['target','point'] as const)('uses %s center semantics after moving the primary recipient',center=>{
 const f=fixture([{...blink,target:'target',destination:'caster'},burst(center)],{targeting:{...base.targeting,kind:'unit',relations:['enemy'],radius:undefined}});
 const departure=enemy(f,'departure',136),arrival=enemy(f,'arrival',117,117),before={departure:departure.hp!,arrival:arrival.hp!};
 f.game.observation.update();expect(f.game.abilities.cast(f.caster,'preview',f.target!)).toBeNull();step(f);
 expect(f.t().x).toBeLessThan(124);
 expect(departure.hp).toBe(before.departure-(center==='point'?70:0));expect(arrival.hp).toBe(before.arrival-(center==='target'?70:0));
});
it('rechecks caster operation filters after a prior form changes its target class',()=>{
 const f=fixture([{op:'status',id:'air',target:'caster',amount:100,polarity:'positive',dispel:true,form:{movement:{locomotion:'air',flightHeight:5}}},{op:'heal',target:'caster',amount:50,filter:{locomotion:['air']}}],{}, {casterHealth:400});
 expect(f.game.abilities.cast(f.caster,'preview',{x:128,y:120})).toBeNull();step(f);
 expect(f.game.spatial.airborne(f.c())).toBe(true);expect(f.c().hp).toBe(450);
});
it('predicts displacement before scoring a caster-centered follow-up without mutating observations',()=>{
 const {a}=fixture([blink,burst('caster')]);
 const c={id:1,x:0,y:0,hp:500,maxHp:500,alive:true,targetable:true,unit:true,owner:'player.1'},e={...c,id:2,x:12,owner:'player.2'};
 const observed=[c,e],before=structuredClone(observed),relation=(v:typeof c)=>v.owner===c.owner?'ally' as const:'enemy' as const;
 expect(abilityAimScore(a,1,c,{id:0,x:12,y:0},observed,relation,'enemy')).toBe(140);
 expect(abilityAimScore(a,1,c,{id:0,x:-12,y:0},observed,relation,'enemy')).toBe(0);expect(observed).toEqual(before);
});
it('predicts an airborne caster filter after a flight form',()=>{
 const {a}=fixture([{op:'status',id:'air',target:'caster',amount:100,polarity:'positive',dispel:true,form:{movement:{locomotion:'air',flightHeight:5}}},{op:'heal',target:'caster',amount:50,filter:{locomotion:['air']}}]);
 const c={id:1,x:0,y:0,hp:400,maxHp:500,alive:true,targetable:true,unit:true,locomotion:'ground' as const};
 expect(abilityAimScore(a,1,c,{id:0,x:10,y:0},[c],()=> 'ally','wounded-ally')).toBe(120);expect(c.locomotion).toBe('ground');
});
it('replays blink then landing burst through delayed multiplayer commands and a mid-cast restore',()=>{
 const f=fixture([blink,burst('caster')]),departure=enemy(f,'departure',122);f.game.observation.update();
 const opts={map:f.game.map,slots:f.game.slots,registry:f.game.registry,seed:42};
 const worlds=[new World(opts),new World(opts)];for(const w of worlds)w.settlement.restore(f.game.snapshot());
 const room=new Room({...localMatch({mapId:'composition',mapRevision:'test',seed:42,slotCount:2,me:0,delay:3}),slots:[...f.game.slots]});
 const channels=[new MemoryChannel(room,0),new MemoryChannel(room,1)],peers=channels.map((c,i)=>new Lockstep(c,i,3));
 peers[0].send({type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'point',position:{x:132,y:120}}});
 const damaged=new Map<number,number>();
 try{
  for(let tick=1;tick<=35;tick++){
   peers[tick%2].confirm(tick);peers[1-tick%2].confirm(tick);
   for(let i=0;i<2;i++){
    const commit=peers[i].take(tick)!;expect(commit).toBeTruthy();
    for(const slot of commit.slots)slot.actions.forEach((action,seq)=>worlds[i].enqueue(action,commit.tick,{player:slot.player,seq}));worlds[i].tick();
   }
   for(const e of worlds[0].settlement.abilities.observedEvents())if(e.ability===f.a.id&&e.event==='damaged'){damaged.set(e.target!,e.amount!);expect(e.origin.x).toBeGreaterThan(128);}
   if([3,18].includes(tick)){const save=JSON.parse(JSON.stringify(worlds[1].snapshot()));worlds[1]=new World(opts);worlds[1].restore(save);}
   expect(worlds[1].checksum(),`tick ${tick}`).toBe(worlds[0].checksum());
  }
  expect(damaged.get(f.target!)).toBe(70);expect(damaged.has(departure.id)).toBe(false);
 }finally{channels.forEach(c=>c.destroy());}
});
