import {expect,it} from 'vitest';
import {abilitySchema,type Effect} from '../../src/content/abilities/schema';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {abilityAimScore} from '../../src/sim/abilities/ai';
import {testAbilities} from '../fixtures/content';
import {testSettings,encounterSource,runLockstep} from './encounter-harness';

const base=testAbilities.abilities.find(a=>a.id==='ability.test.blink')!;
const presentation=testAbilities.presentations.find(p=>p.id===base.presentation)!;
const blink=base.onRelease[0] as Effect;
const query=(center:'caster'|'target'|'point')=>({center,radius:4,relations:['enemy'],allowSelf:false,includeBuildings:false,excludePrimary:true,maxTargets:8,order:'nearest'} as const);
const burst=(center:'caster'|'target'|'point')=>({op:'damage',target:'target',amount:70,damageType:'spell',query:query(center)});
function fixture(ops:unknown[],patch={},settings={}){
 const a=abilitySchema.parse({...base,onRelease:ops,...patch});
 const f=createAbilityEncounter(a,presentation,testSettings({relationship:'enemy',targetHealth:500,distance:12,mana:1000,...settings}),false,encounterSource());
 return {...f,a,c:()=>f.game.context.get(f.caster)!,t:()=>f.game.context.get(f.target)!};
}
function step(f:ReturnType<typeof fixture>,n=30){for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});}
function enemy(f:ReturnType<typeof fixture>,id:string,x:number,y=120){return f.game.context.create({id,definition:'unit.test.warrior',owner:'player.2',position:{x,y},rotation:0});}

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
 const damaged=new Map<number,number>();
 runLockstep(f.game,{type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'point',position:{x:132,y:120}}},35,{restoreAt:[3,18],onTick:(_,world)=>{
  for(const e of world.settlement.abilities.observedEvents())if(e.ability===f.a.id&&e.event==='damaged'){damaged.set(e.target!,e.amount!);expect(e.origin.x).toBeGreaterThan(128);}
 }});
 expect(damaged.get(f.target!)).toBe(70);expect(damaged.has(departure.id)).toBe(false);
});
