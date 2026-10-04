import {expect,it} from 'vitest';
import {abilitySchema,resolveEffect,type Effect} from '../../src/content/abilities/schema';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {abilityAimScore} from '../../src/sim/abilities/ai';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import {SpellCorpses} from '../../src/sim/abilities/corpses';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import type {PreviewState} from '../../tooling/spell-editor/shared/view';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.feral-spirit')!;
const presentation=coreAbilities.presentations.find(p=>p.id===base.presentation)!;
const operation:Extract<Effect,{op:'resurrect'}>={op:'resurrect',target:'caster',ownership:'caster',durationTicks:{rankParameter:'life'},grants:['physicalWard','spellWard'],amount:6,corpses:{radius:12,relations:['ally','enemy','neutral'],order:'strongest'},healthPermille:1000,manaPermille:0,placementRadius:3,supply:'allow-over-cap'};
const statuses=[{op:'status',target:'target',id:'physicalWard',amount:{rankParameter:'life'},polarity:'positive',dispel:false,modifiers:{},immunity:'physical'},{op:'status',target:'target',id:'spellWard',amount:{rankParameter:'life'},polarity:'positive',dispel:false,modifiers:{},immunity:'spell',spellImmunity:'hostile'}];
function definition(patch:Partial<typeof operation>={},extra={}){return abilitySchema.parse({...base,ranks:[{life:80,count:2},{life:120,count:2}],cast:{...base.cast,cost:{...base.cast.cost,amount:0},cooldown:{...base.cast.cooldown,ticks:0}},onRelease:[{...operation,...patch}],statuses,...extra});}
function fixture(patch:Partial<typeof operation>={},settings={},extra={}){const a=definition(patch,extra);return {...createAbilityEncounter(a,presentation,encounterSettingsSchema.parse({relationship:'enemy',targetCount:3,fallenTargets:true,distance:5,...settings})),a};}
const step=(f:ReturnType<typeof fixture>,n:number)=>{for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});};
const raised=(f:ReturnType<typeof fixture>)=>f.game.entities.filter(e=>e.summoned?.reanimatedFrom!==undefined);
function cast(f:ReturnType<typeof fixture>){expect(f.game.abilities.cast(f.caster,'preview',f.caster)).toBeNull();step(f,25);}
it('reanimates enemy corpses for the caster with original models and target-only status grants',()=>{
 const f=fixture(),corpses=structuredClone(f.game.state.corpses);cast(f);expect(raised(f)).toHaveLength(3);expect(f.game.state.corpses).toEqual([]);
 for(const e of raised(f)){expect(e.owner).toBe('player.1');expect(e.definition).toBe(corpses.find(c=>c.id===e.summoned!.reanimatedFrom)!.definition);expect(e.hp).toBe(f.game.context.stats(e).maxHp);expect(e.spellStatuses?.map(s=>s.status)).toEqual(['physicalWard','spellWard']);expect(e.spellStatuses?.every(s=>s.cast===e.summoned!.cast&&s.expires===e.summoned!.expires)).toBe(true);}
 expect(f.game.context.get(f.caster)!.spellStatuses).toBeUndefined();expect(f.game.abilities.observedEvents().filter(e=>e.event==='statusApplied')).toHaveLength(6);expect(f.game.abilities.observedEvents().filter(e=>e.event==='resurrected').every(e=>e.durationTicks===80)).toBe(true);
});
it('blocks physical damage, spell damage and hostile dispel while keeping allied spells usable',()=>{
 const f=fixture();cast(f);const e=raised(f)[0],enemy=f.game.context.create({id:'enemy',definition:'unit.ants.warrior',owner:'player.2',position:{x:128,y:120},rotation:0});
 for(const damageType of Object.keys(f.game.registry.rules.damageTypes))expect(f.game.combat.abilityHit({source:enemy.id,target:e.id,damage:100,damageType}).damage).toBe(0);
 const dispel=coreAbilities.abilities.find(a=>a.id==='ability.core.dispel-magic')!,op=dispel.onRelease.find(e=>e.op==='dispel')!;
 expect(new SpellStatuses(f.game).apply(enemy.id,e.id,dispel,1,f.game.state.nextCast++,resolveEffect(op,1,dispel.ranks[0]))).toBe(0);expect(e.spellStatuses).toHaveLength(2);
 const bloodlust=coreAbilities.abilities.find(a=>a.id==='ability.core.bloodlust')!;
 expect(new SpellStatuses(f.game).apply(f.caster,e.id,bloodlust,1,f.game.state.nextCast++,resolveEffect(bloodlust.onRelease[0] as Effect,1,bloodlust.ranks[0]))).toBeGreaterThan(0);
});
it('can keep original ownership and reanimate neutral camp units into a player army',()=>{
 const original=fixture({ownership:'original',grants:[]});cast(original);expect(raised(original).every(e=>e.owner==='player.2')).toBe(true);
 const neutral=fixture({}, {relationship:'neutral',combat:true});cast(neutral);expect(raised(neutral)).toHaveLength(3);expect(raised(neutral).every(e=>e.owner==='player.1'&&!e.unit?.camp)).toBe(true);neutral.game.restore(neutral.game.snapshot());
});
it('ranked lifetime and grants expire together, without another corpse or death loop',()=>{
 const f=fixture();f.game.context.get(f.caster)!.abilities!.ranks.preview=2;cast(f);const end=raised(f)[0].summoned!.expires;expect(end-raised(f)[0].summoned!.started).toBe(120);
 step(f,end-f.game.state.tick-1);expect(raised(f)).toHaveLength(3);step(f,1);expect(raised(f)).toEqual([]);expect(f.game.state.corpses).toEqual([]);
});
it('survives caster death and preserves lockstep across pending, live and expired saves',()=>{
 const f=fixture(),g=fixture();expect(f.game.abilities.cast(f.caster,'preview',f.caster)).toBeNull();g.game.restore(f.game.snapshot());
 for(let i=0;i<25;i++){step(f,1);step(g,1);expect(f.game.checksum()).toBe(g.game.checksum());}
 const c=f.game.context.get(f.caster)!;c.hp=0;f.game.onCombatDeath(c);g.game.restore(f.game.snapshot());expect(raised(g)).toHaveLength(3);
 for(let i=0;i<100;i++){step(f,1);step(g,1);expect(f.game.checksum()).toBe(g.game.checksum());}
 expect(raised(f)).toEqual([]);expect(f.game.state.corpses.every(c=>c.id===f.caster)).toBe(true);g.game.restore(f.game.snapshot());
});
it('early reanimated death never yields another consumable corpse',()=>{
 const f=fixture({grants:[]});cast(f);const e=raised(f)[0];e.hp=0;f.game.onCombatDeath(e);expect(f.game.state.corpses).toEqual([]);f.game.restore(f.game.snapshot());
});
it('rejects forged resurrection lineage, expiry and summon provenance atomically',()=>{
 const f=fixture();cast(f);const before=f.game.checksum();
 const corruptions=[(s:any)=>s.reanimatedFrom=f.caster,(s:any)=>s.reanimatedFrom=999999,(s:any)=>delete s.reanimatedFrom,(s:any)=>s.expires++,(s:any)=>s.rank=3];
 for(const corrupt of corruptions){const save=f.game.snapshot();corrupt(save.state.entities.find(e=>e.summoned)!.summoned);expect(()=>f.game.restore(save)).toThrow();expect(f.game.checksum()).toBe(before);}
 const duplicate=f.game.snapshot(),units=duplicate.state.entities.filter(e=>e.summoned);units[1].summoned!.reanimatedFrom=units[0].summoned!.reanimatedFrom;expect(()=>f.game.restore(duplicate)).toThrow();expect(f.game.checksum()).toBe(before);
});
it('requires explicit provenance for transferred or temporary resurrection in direct consumers',()=>{
 const f=fixture(),store=new SpellCorpses(f.game.context);expect(store.resurrect(operation,f.a,1,{x:120,y:120},()=>true,()=> 'enemy')).toEqual([]);expect(f.game.state.corpses).toHaveLength(3);
});
it('creation grants work for normal summons, corpse summons and permanent resurrection',()=>{
 for(const op of [{...(base.onRelease[0] as Effect),grants:operation.grants}, {...(base.onRelease[0] as Effect),target:'caster',grants:operation.grants,corpses:{...operation.corpses,maxTargets:1}}, {...operation,durationTicks:undefined}]){
  const f=fixture({}, {}, {onRelease:[op]});cast(f);const created=f.game.entities.filter(e=>e.id!==f.caster);expect(created.length).toBeGreaterThan(0);expect(created.every(e=>e.spellStatuses?.length===2)).toBe(true);expect(f.game.context.get(f.caster)!.spellStatuses).toBeUndefined();f.game.restore(f.game.snapshot());
 }
});
it('rejects invalid durations, duplicate/missing grants and grants with ambiguous recipients',()=>{
 for(const patch of [{durationTicks:0},{durationTicks:144001},{durationTicks:{rankParameter:'unknown'}},{grants:['missing']},{grants:['physicalWard','physicalWard']}])expect(()=>definition(patch)).toThrow();
 for(const patch of [{target:'caster'},{lifetime:'instance'},{query:{anchor:'target',radius:2,relations:['ally']}}])expect(()=>definition({}, {statuses:[{...statuses[0],...patch},statuses[1]]})).toThrow();
});
it('workbench timeline covers temporary resurrection and resets/replays the entire lifetime',async()=>{
 const a=definition(),s=new SpellEditorService('/tmp');await s.execute({op:'preview.load',document:{definition:a,presentation:{...presentation,effects:[],icon:undefined}},settings:{relationship:'enemy',targetCount:3,fallenTargets:true,distance:5}});const state=()=>s.state() as PreviewState;
 for(let i=0;i<2;i++){await s.execute({op:'preview.cast'});await s.execute({op:'preview.seek',tick:30});expect(state().entities).toHaveLength(4);const hash=state().checksum;expect(state().timelineEvents.filter(e=>e.event==='resurrected').every(e=>e.durationTicks===80&&e.endedTick===undefined)).toBe(true);await s.execute({op:'preview.seek',tick:125});expect(state().entities).toHaveLength(1);expect(state().timelineEvents.filter(e=>e.event==='resurrected').every(e=>e.endedTick===e.tick+80)).toBe(true);await s.execute({op:'preview.seek',tick:30});expect(state().checksum).toBe(hash);}
});

it('creation immunity cannot block later sibling grants, while subsequent ordinary spells still respect it',()=>{
 const f=fixture({}, {}, {statuses:[{...statuses[0],spellImmunity:'all'},statuses[1]]});cast(f);expect(raised(f).every(e=>e.spellStatuses?.length===2)).toBe(true);
 const bloodlust=coreAbilities.abilities.find(a=>a.id==='ability.core.bloodlust')!;expect(new SpellStatuses(f.game).apply(f.caster,raised(f)[0].id,bloodlust,1,f.game.state.nextCast++,resolveEffect(bloodlust.onRelease[0] as Effect,1,bloodlust.ranks[0]))).toBe(0);
});

it('AI values temporary armies only near threats and does not reward reviving enemies for their original owner',()=>{
 const f=fixture(),caster={id:f.caster,x:120,y:120,hp:500,maxHp:500,alive:true,targetable:true,unit:true},enemy={...caster,id:100,x:128};
 const corpses=new SpellCorpses(f.game.context).views().map(c=>({...c,relation:'enemy' as const}));
 const score=(a=f.a,actors=[caster,enemy])=>abilityAimScore(a,1,caster,caster,actors,t=>t.id===caster.id?'ally':'enemy','enemy',()=>false,corpses);
 expect(score(f.a,[caster])).toBe(0);expect(score()).toBeGreaterThan(0);expect(score(definition({ownership:'original'}))).toBeLessThan(0);expect(score(definition({ownership:'original',durationTicks:undefined}))).toBeLessThan(0);
});
