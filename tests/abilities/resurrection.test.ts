import {expect,it,vi} from 'vitest';
import {abilitySchema,type Effect} from '../../src/content/abilities/schema';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema,applyEncounterPreset,encounterPresetId} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellCorpses,selectCorpses,type CorpseView,CORPSE_TICKS} from '../../src/sim/abilities/corpses';
import {abilityAimScore,corpseAbilityAims} from '../../src/sim/abilities/ai';
import {colonySupply} from '../../src/sim/game/supply';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import type {PreviewState} from '../../tooling/spell-editor/shared/view';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.feral-spirit')!;
const operation:Extract<Effect,{op:'resurrect'}>={op:'resurrect',target:'caster',amount:6,corpses:{radius:12,relations:['ally'],order:'strongest'},healthPermille:1000,manaPermille:0,placementRadius:3,supply:'allow-over-cap'};
function definition(op:Partial<typeof operation>={}){return abilitySchema.parse({...base,cast:{...base.cast,cost:{...base.cast.cost,amount:0},cooldown:{...base.cast.cooldown,ticks:0}},onRelease:[{...operation,...op}]});}
const presentation=coreAbilities.presentations.find(p=>p.id===base.presentation)!;
function fixture(op:Partial<typeof operation>={},settings={}){const a=definition(op);const f=createAbilityEncounter(a,presentation,encounterSettingsSchema.parse({relationship:'ally',targetCount:6,distance:5,fallenTargets:true,combat:false,...settings}));return {...f,a,store:new SpellCorpses(f.game.context)};}
function cast(f:ReturnType<typeof fixture>){expect(f.game.abilities.cast(f.caster,'preview',f.caster)).toBeNull();for(let i=0;i<30;i++)f.game.tick();}
const raise=(f:ReturnType<typeof fixture>,op=operation,visible=(_:CorpseView)=>true)=>f.store.resurrect(op,f.a,1,{x:120,y:120},visible,c=>c.owner==='player.1'?'ally':'enemy');
it('raises six allied corpses with fresh identities, full health and one event each',()=>{
 const f=fixture(),ids=f.game.state.corpses.map(c=>c.id);cast(f);expect(f.game.state.corpses).toEqual([]);const units=f.game.entities.filter(e=>e.id!==f.caster);expect(units).toHaveLength(6);
 for(const e of units){expect(ids).not.toContain(e.id);expect(e.owner).toBe('player.1');expect(e.hp).toBe(f.game.context.stats(e).maxHp);expect(e.summoned).toBeUndefined();}
 expect(f.game.abilities.observedEvents().filter(e=>e.event==='resurrected')).toHaveLength(6);expect(new Set(units.map(e=>`${e.x},${e.y}`)).size).toBe(6);
 expect(raise(f)).toEqual([]);
});
it('preserves each original owner when raising allied players',()=>{
 const f=fixture();f.game.state.corpses[0].owner='player.2';const raised=f.store.resurrect(operation,f.a,1,{x:120,y:120},()=>true,()=> 'ally');expect(raised).toHaveLength(6);expect(f.game.entities.filter(e=>e.owner==='player.2')).toHaveLength(1);
});
it('requires supply when declared, can bypass supply capacity, and always enforces unit limit',()=>{
 const f=fixture();expect(colonySupply(f.game.entities,'player.1',f.game.registry).capacity).toBe(0);expect(raise(f,{...operation,supply:'require'})).toEqual([]);expect(f.game.state.corpses).toHaveLength(6);
 const population=f.game.context.populationCandidates();const stub=vi.spyOn(f.game.context,'populationCandidates').mockReturnValue(Array.from({length:f.game.registry.rules.maxUnits},(_,i)=>({...population[0],id:10000+i})));expect(raise(f)).toEqual([]);expect(f.game.state.corpses).toHaveLength(6);stub.mockRestore();expect(raise(f)).toHaveLength(6);
});
it('does not consume expired, unseen, distant, enemy or blocked corpses',()=>{
 const f=fixture();expect(raise(f,operation,()=>false)).toEqual([]);f.game.state.corpses[0].owner='player.2';f.game.state.corpses[1].position={x:220,y:220};
 const nearest=vi.spyOn(f.game.context.spatial,'nearest').mockReturnValue(null);expect(raise(f)).toEqual([]);expect(f.game.state.corpses).toHaveLength(6);nearest.mockRestore();
 expect(raise(f)).toHaveLength(4);expect(f.game.state.corpses).toHaveLength(2);f.game.state.tick=CORPSE_TICKS;expect(raise(f)).toEqual([]);
});
it('orders stronger corpses first then distance and ID; filters traits and count',()=>{
 const f=fixture({amount:2}),views=f.store.views();views[3].level=5;views[4].level=5;views[4].maxHp=600;
 expect(selectCorpses(views,operation,{}, {x:120,y:120},()=> 'ally').slice(0,2).map(c=>c.id)).toEqual([views[4].id,views[3].id]);
 expect(selectCorpses(views,{...operation,corpses:{...operation.corpses,filter:{natures:['undead']}}},{},{x:120,y:120},()=> 'ally')).toEqual([]);
 cast(f);expect(f.game.state.corpses).toHaveLength(4);
});
it('restores mana and absolute cooldowns without copying pending actions; the unit can die again',()=>{
 const f=fixture();const e=f.game.context.create({id:'second-caster',definition:'unit.preview.caster',owner:'player.1',position:{x:118,y:120},rotation:0});e.abilities!.cooldowns[base.id]=100;e.hp=0;f.game.onCombatDeath(e);
 const result=raise(f,{...operation,amount:8,healthPermille:500,manaPermille:250});const restored=result.map(r=>f.game.context.get(r.id)!).find(e=>e.definition==='unit.preview.caster')!;
 expect(restored.hp).toBe(250);expect(restored.abilities).toMatchObject({mana:250,pending:null,cooldowns:{[base.id]:100},ranks:{preview:1}});restored.hp=0;f.game.onCombatDeath(restored);expect(f.game.state.corpses).toHaveLength(1);expect(f.game.state.corpses[0].id).toBe(restored.id);expect(f.game.state.corpses[0].id).not.toBe(e.id);f.game.restore(f.game.snapshot());
});
it('replays a pending resurrection from save with identical events and checksums',()=>{
 const f=fixture(),g=fixture();expect(f.game.abilities.cast(f.caster,'preview',f.caster)).toBeNull();g.game.restore(f.game.snapshot());for(let i=0;i<45;i++){f.game.tick();g.game.tick();expect(g.game.checksum()).toBe(f.game.checksum());}
 const events=(game:typeof f.game)=>game.abilities.observedEvents().filter(e=>e.event!=='accepted').map(({id,...e})=>e);expect(events(g.game)).toEqual(events(f.game));g.game.restore(f.game.snapshot());
});
it('scores only supplied visible corpse knowledge and does not require living allies',()=>{
 const f=fixture(),caster={id:f.caster,x:120,y:120,hp:500,maxHp:500,alive:true,targetable:true,unit:true};
 const score=(views:CorpseView[])=>abilityAimScore(f.a,1,caster,caster,[caster],()=> 'ally','wounded-ally',()=>false,views);
 expect(score([])).toBe(0);expect(score(f.store.views().map(c=>({...c,relation:'ally'})))).toBeGreaterThan(0);expect(score(f.store.views().map(c=>({...c,relation:'enemy'})))).toBe(0);
});
it('rejects out-of-bounds or missing ranked resurrection parameters',()=>{
 for(const patch of [{amount:9},{amount:0},{healthPermille:0},{healthPermille:1001},{manaPermille:1001},{corpses:{...operation.corpses,radius:33}},{healthPermille:{rankParameter:'absent'}}])expect(()=>definition(patch)).toThrow();
});
it('workbench fallen fixture resets and scrubs resurrection deterministically',async()=>{
 const a=definition(),service=new SpellEditorService('/tmp'),p={...presentation,effects:[],icon:undefined};
 await service.execute({op:'preview.load',document:{definition:a,presentation:p},settings:{relationship:'ally',targetCount:6,fallenTargets:true,distance:5}});
 const state=()=>service.state() as PreviewState;expect(state().corpses).toHaveLength(6);expect(state().entities).toHaveLength(1);
 for(let i=0;i<2;i++){await service.execute({op:'preview.cast'});await service.execute({op:'preview.seek',tick:30});expect(state().entities).toHaveLength(7);expect(state().corpses).toHaveLength(0);const hash=state().checksum;await service.execute({op:'preview.seek',tick:0});expect(state().corpses).toHaveLength(6);await service.execute({op:'preview.seek',tick:30});expect(state().checksum).toBe(hash);}
});

it('fallen setup is independent of spells and selecting another setup clears it',()=>{const settings=applyEncounterPreset(encounterSettingsSchema.parse({}),'fallen-allies');expect(encounterPresetId(settings)).toBe('fallen-allies');expect(applyEncounterPreset(settings,'ally-group').fallenTargets).toBe(false);});

it('point resurrection samples corpse positions and raises from the selected area',()=>{
 const a=abilitySchema.parse({...definition({target:'point',corpses:{...operation.corpses,radius:3}}),targeting:{...base.targeting,kind:'point',range:24,radius:3}});
 const f=createAbilityEncounter(a,presentation,encounterSettingsSchema.parse({relationship:'ally',fallenTargets:true,targetCount:1,distance:10}));const store=new SpellCorpses(f.game.context);
 expect(corpseAbilityAims(a,store.views())).toEqual([{id:f.target,x:130,y:120}]);expect(corpseAbilityAims(base,store.views())).toEqual([]);
 expect(f.game.abilities.cast(f.caster,'preview',{x:130,y:120})).toBeNull();for(let i=0;i<30;i++)f.game.tick();expect(f.game.state.corpses).toEqual([]);expect(f.game.entities).toHaveLength(2);
});
it('observations expose only visible corpse positions, not private spell state',()=>{
 const f=fixture();f.game.state.corpses[0].position={x:230,y:230};f.game.observation.update();
 const visible=f.game.view('player.1').corpses!;expect(visible).toHaveLength(5);expect(visible.some(c=>c.id===f.game.state.corpses[0].id)).toBe(false);expect(visible[0]).not.toHaveProperty('abilities');expect(f.game.view().corpses).toHaveLength(6);
});
