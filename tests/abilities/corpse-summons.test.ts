import {expect,it,vi} from 'vitest';
import {abilitySchema,resolveEffect,type Effect} from '../../src/content/abilities/schema';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellSummons} from '../../src/sim/abilities/summons';
import {SpellCorpses} from '../../src/sim/abilities/corpses';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import type {PreviewState} from '../../tooling/spell-editor/shared/view';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.feral-spirit')!;
const presentation=coreAbilities.presentations.find(p=>p.id===base.presentation)!;
const operation:Extract<Effect,{op:'summon'}>={op:'summon',target:'point',amount:2,definition:'unit.spell.feral-spirit',durationTicks:80,replace:false,radius:2,corpses:{radius:3,relations:['ally','enemy'],order:'nearest',maxTargets:1}};
function definition(patch:Partial<typeof operation>={},extra={}){return abilitySchema.parse({...base,...extra,targeting:{...base.targeting,kind:'point',range:16,radius:3},cast:{...base.cast,cost:{...base.cast.cost,amount:0},cooldown:{...base.cast.cooldown,ticks:0}},onRelease:[{...operation,...patch}]});}
function fixture(patch:Partial<typeof operation>={},settings={},extra={}){const a=definition(patch,extra);return {...createAbilityEncounter(a,presentation,encounterSettingsSchema.parse({relationship:'enemy',fallenTargets:true,targetCount:1,distance:8,...settings})),a};}
const step=(f:ReturnType<typeof fixture>,n:number)=>{for(let i=0;i<n;i++)f.game.tick();};
const summons=(f:ReturnType<typeof fixture>)=>f.game.entities.filter(e=>e.summoned);
function cast(f:ReturnType<typeof fixture>,point={x:128,y:120}){expect(f.game.abilities.cast(f.caster,'preview',point)).toBeNull();step(f,19);}
function spawn(f:ReturnType<typeof fixture>,patch:Partial<typeof operation>={},visible=true){const op=resolveEffect({...operation,...patch},1,{}) as Extract<ReturnType<typeof resolveEffect>,{op:'summon'}>;return new SpellSummons(f.game).fromCorpses({id:f.caster,owner:'player.1',rotation:90},f.a,1,f.game.state.nextCast++,op,{x:128,y:120},visible?new SpellCorpses(f.game.context).views().map(c=>({...c,relation:'enemy'})):[]);}
it('consumes an enemy corpse once, produces two source-owned temporary summons and emits at the corpse',()=>{
 const f=fixture();cast(f);expect(f.game.state.corpses).toEqual([]);expect(summons(f)).toHaveLength(2);expect(summons(f).every(e=>e.owner==='player.1')).toBe(true);
 expect(f.game.abilities.observedEvents().find(e=>e.event==='summoned')).toMatchObject({target:0,point:{x:128,y:120},amount:2,durationTicks:80});
 cast(f);expect(summons(f)).toHaveLength(2);step(f,60);expect(summons(f)).toEqual([]);expect(f.game.state.corpses).toEqual([]);
});
it('does not consume a corpse or remove an old group when every replacement placement fails',()=>{
 const f=fixture({}, {targetCount:2,targetSpacing:1});spawn(f);expect(summons(f)).toHaveLength(2);const previous=summons(f).map(e=>e.id),corpses=f.game.state.corpses.map(c=>c.id);
 const blocked=vi.spyOn(f.game.context.spatial,'nearest').mockReturnValue(null);expect(spawn(f,{replace:true})).toEqual([]);blocked.mockRestore();expect(summons(f).map(e=>e.id)).toEqual(previous);expect(f.game.state.corpses.map(c=>c.id)).toEqual(corpses);
});
it('consumes one corpse on a partial spawn and leaves blocked corpses for another cast',()=>{
 const f=fixture({}, {targetCount:2,targetSpacing:1}),nearest=f.game.context.spatial.nearest.bind(f.game.context.spatial);let attempts=0;
 const blocked=vi.spyOn(f.game.context.spatial,'nearest').mockImplementation((...args)=>++attempts===1?nearest(...args):null);
 expect(spawn(f)).toHaveLength(1);expect(summons(f)).toHaveLength(1);expect(f.game.state.corpses).toHaveLength(1);blocked.mockRestore();
});
it('skips invisible and filtered corpses without creating units',()=>{
 const f=fixture();expect(spawn(f,{},false)).toEqual([]);expect(spawn(f,{corpses:{...operation.corpses!,filter:{natures:['undead']}}})).toEqual([]);expect(f.game.state.corpses).toHaveLength(1);expect(summons(f)).toEqual([]);
});
it('caps corpse groups independently and replaces a prior group only once',()=>{
 const f=fixture({corpses:{...operation.corpses!,radius:8,maxTargets:3}}, {targetCount:6,targetSpacing:2});spawn(f);const old=summons(f).map(e=>e.id);
 const raised=spawn(f,{replace:true,corpses:{...operation.corpses!,radius:8,maxTargets:3}});expect(raised).toHaveLength(3);expect(summons(f)).toHaveLength(6);expect(summons(f).every(e=>!old.includes(e.id))).toBe(true);expect(f.game.state.corpses).toHaveLength(2);
});
it('hard unit limits include training reservations and leave unused corpses intact',()=>{
 const f=fixture(),c=f.game.context.get(f.caster)!;
 const full=vi.spyOn(f.game.context,'populationCandidates').mockReturnValue(Array.from({length:f.game.registry.rules.maxUnits},(_,i)=>({...c,id:1000+i})));expect(spawn(f)).toEqual([]);expect(f.game.state.corpses).toHaveLength(1);full.mockRestore();
});
it('ranked corpse count, creature, lifetime and units-per-corpse resolve together',()=>{
 const f=fixture({amount:{rankParameter:'count'},durationTicks:{rankParameter:'life'},definition:{byRank:['unit.spell.shadow-spirit-lesser','unit.spell.shadow-spirit-greater']},corpses:{...operation.corpses!,maxTargets:{rankParameter:'corpses'}}},{targetCount:3,targetSpacing:1},{ranks:[{count:1,life:40,corpses:1},{count:2,life:100,corpses:2}]});
 f.game.context.get(f.caster)!.abilities!.ranks.preview=2;cast(f);expect(summons(f)).toHaveLength(4);expect(f.game.state.corpses).toHaveLength(1);expect(summons(f).every(e=>e.definition==='unit.spell.shadow-spirit-greater'&&e.summoned!.expires-e.summoned!.started===100)).toBe(true);
});
it('restores pending casts and expiration in lockstep after the source dies',()=>{
 const f=fixture(),g=fixture();expect(f.game.abilities.cast(f.caster,'preview',{x:128,y:120})).toBeNull();g.game.restore(f.game.snapshot());
 for(let i=0;i<20;i++){step(f,1);step(g,1);expect(f.game.checksum()).toBe(g.game.checksum());}
 const c=f.game.context.get(f.caster)!;c.hp=0;f.game.onCombatDeath(c);g.game.restore(f.game.snapshot());for(let i=0;i<90;i++){step(f,1);step(g,1);expect(f.game.checksum()).toBe(g.game.checksum());}expect(summons(f)).toEqual([]);
});
it('point autocast considers visible corpses only when combat gives the summons utility',()=>{
 const f=fixture({}, {}, {autocast:{intervalTicks:1,enabledByDefault:true}});step(f,5);expect(summons(f)).toEqual([]);
 const threat=f.game.context.create({id:'threat',definition:'unit.ants.warrior',owner:'player.2',position:{x:132,y:120},rotation:270});f.game.command('player.2',{type:'hold',actors:[threat.id]});f.game.observation.update();step(f,20);expect(summons(f)).toHaveLength(2);expect(f.game.state.corpses).toEqual([]);
});
it('rejects excessive ranked products and ambiguous live-recipient queries',()=>{
 for(const patch of [{amount:0},{amount:5,corpses:{...operation.corpses!,maxTargets:2}},{corpses:{...operation.corpses!,maxTargets:0}},{corpses:{...operation.corpses!,radius:33}},{target:'target'},{corpses:{...operation.corpses!,maxTargets:{rankParameter:'unknown'}}}])expect(()=>definition(patch as Partial<typeof operation>)).toThrow();
});
it('workbench rewinds consumed corpses, summon effects and repeated casts',async()=>{
 const a=definition(),service=new SpellEditorService('/tmp');await service.execute({op:'preview.load',document:{definition:a,presentation:{...presentation,effects:[],icon:undefined}},settings:{relationship:'enemy',targetCount:1,fallenTargets:true,distance:8}});const state=()=>service.state() as PreviewState;
 for(let i=0;i<2;i++){await service.execute({op:'preview.aim',position:{x:128,y:120}});await service.execute({op:'preview.cast'});await service.execute({op:'preview.seek',tick:30});expect(state().corpses).toHaveLength(0);expect(state().entities).toHaveLength(3);const hash=state().checksum;await service.execute({op:'preview.seek',tick:0});expect(state().corpses).toHaveLength(1);await service.execute({op:'preview.seek',tick:30});expect(state().checksum).toBe(hash);}
});

it('retains hostile neutral-camp allegiance and rejects forged camp references on restore',()=>{
 const f=fixture({}, {relationship:'neutral',combat:true});expect(f.game.state.corpses[0].camp).toBe('preview-camp');expect(f.game.view('player.1').corpses![0].relation).toBe('enemy');f.game.restore(f.game.snapshot());
 const corrupt=f.game.snapshot();corrupt.state.corpses[0].camp='missing-camp';expect(()=>f.game.restore(corrupt)).toThrow();cast(f);expect(summons(f)).toHaveLength(2);expect(f.game.state.corpses).toEqual([]);
});
it('simultaneous casters cannot spend the same corpse twice',()=>{
 const f=fixture(),second=f.game.context.create({id:'other-caster',definition:'unit.preview.caster',owner:'player.1',position:{x:120,y:119},rotation:90});expect(f.game.abilities.cast(f.caster,'preview',{x:128,y:120})).toBeNull();expect(f.game.abilities.cast(second.id,'preview',{x:128,y:120})).toBeNull();step(f,30);expect(summons(f)).toHaveLength(2);expect(f.game.state.corpses).toEqual([]);
});
it('interruption before release leaves the corpse and creates no summon',()=>{
 const f=fixture();expect(f.game.abilities.cast(f.caster,'preview',{x:128,y:120})).toBeNull();f.game.abilities.cancel(f.caster,'Interrupted');step(f,30);expect(f.game.state.corpses).toHaveLength(1);expect(summons(f)).toEqual([]);
});

it('active cap spans corpse groups and leaves unused corpses intact at capacity',()=>{
 const f=fixture({}, {targetCount:3,targetSpacing:1});
 const patch={maxActive:3,corpses:{...operation.corpses!,radius:8,maxTargets:3}};
 expect(spawn(f,patch).reduce((n,g)=>n+g.amount,0)).toBe(3);expect(summons(f)).toHaveLength(3);expect(f.game.state.corpses).toHaveLength(1);
 expect(spawn(f,patch)).toEqual([]);expect(f.game.state.corpses).toHaveLength(1);
});
