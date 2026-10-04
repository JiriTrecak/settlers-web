import {expect,it,vi} from 'vitest';
import {abilitySchema,abilityLibrarySchema,type Effect} from '../../src/content/abilities/schema';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import type {PreviewState} from '../../tooling/spell-editor/shared/view';
import {colonySupply} from '../../src/sim/game/supply';
import {builtinSource} from '../../src/content/builtin';
import {ContentRegistry} from '../../src/content/registry';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import type {Definition} from '../../src/content/schema';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.death-burst')!;
const presentation=coreAbilities.presentations.find(p=>p.id===base.presentation)!;
const operation:Extract<Effect,{op:'revive'}>={op:'revive',id:'return',target:'caster',amount:{rankParameter:'delay'},healthPermille:1000,manaPermille:1000,placementRadius:3,placementWaitTicks:20};
function definition(op:Partial<typeof operation>={},extra={}){return abilitySchema.parse({...base,ranks:[{delay:12,cooldown:80}],onRelease:[],triggers:[{id:'rebirth',event:'death',cooldownTicks:{rankParameter:'cooldown'},operations:[{...operation,...op}]}],...extra});}
function fixture(op:Partial<typeof operation>={},settings={},extra={}){const a=definition(op,extra),f=createAbilityEncounter(a,presentation,encounterSettingsSchema.parse({casterHero:true,relationship:'enemy',targetCount:1,targetHealth:500,...settings}));return {...f,a,c:f.game.context.get(f.caster)!};}
const step=(f:ReturnType<typeof fixture>,n=1)=>{for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});};
const die=(f:ReturnType<typeof fixture>)=>{f.c.hp=0;f.game.onCombatDeath(f.c);};
it('retains hero identity and returns at the death location after the declared delay',()=>{
 const f=fixture(),id=f.c.id;die(f);expect(f.c.fallen).toBe(true);step(f);expect(f.c.spellReturn).toMatchObject({started:1,due:13,deadline:33});expect(f.game.state.corpses).toEqual([]);step(f,11);expect(f.c.hp).toBe(0);step(f);
 expect(f.c.id).toBe(id);expect(f.c.fallen).toBeUndefined();expect(f.c.hp).toBe(500);expect(f.c.abilities?.mana).toBe(1000);expect(f.c.unit?.order).toBeNull();expect(f.c.readyTick).toBe(14);expect(f.c.x).toBe(120);expect(f.game.abilities.observedEvents().filter(e=>e.event==='revivalStarted'||e.event==='revived').map(e=>e.event)).toEqual(['revivalStarted','revived']);f.game.restore(f.game.snapshot());
});
it('uses a saved trigger cooldown to prevent repeated death loops',()=>{
 const f=fixture();die(f);step(f,14);expect(f.c.spellTriggerCooldowns?.[f.a.id+':rebirth']).toMatchObject({started:0,expires:80});die(f);expect(f.game.state.spellLifecycleReactions).toEqual([]);step(f,80);expect(f.c.fallen).toBe(true);expect(f.c.spellReturn).toBeUndefined();
 const g=fixture();die(g);step(g,81);die(g);expect(g.game.state.spellLifecycleReactions).toHaveLength(1);step(g,14);expect(g.c.fallen).toBeUndefined();
});
it('does not reincarnate non-heroes or cleanup removals',()=>{
 const f=fixture({}, {casterHero:false});die(f);step(f,20);expect(f.game.context.get(f.caster)).toBeUndefined();expect(f.game.abilities.observedEvents().some(e=>e.event==='revivalStarted')).toBe(false);
 const g=fixture();g.game.economy.remove(g.c);step(g,20);expect(g.game.state.spellLifecycleReactions).toEqual([]);expect(g.game.context.get(g.caster)).toBeUndefined();
});
it('retries occupied terrain and safely leaves a fallen hero after the deadline',()=>{
 const f=fixture();die(f);step(f);const blocked=vi.spyOn(f.game.spatial,'nearest').mockReturnValue(null);step(f,15);expect(f.c.spellReturn).toBeDefined();blocked.mockRestore();step(f);expect(f.c.hp).toBe(500);
 const g=fixture();die(g);step(g);const forever=vi.spyOn(g.game.spatial,'nearest').mockReturnValue(null);step(g,32);expect(g.c.spellReturn).toBeUndefined();expect(g.c.fallen).toBe(true);expect(g.game.abilities.observedEvents().some(e=>e.event==='revivalCancelled')).toBe(true);forever.mockRestore();g.game.restore(g.game.snapshot());
});
it('reserves supply and a unit slot, rejects duplicate altar revival, and ignores later supply loss',()=>{
 const f=fixture();die(f);step(f);const supply=colonySupply(f.game.entities,'player.1',f.game.registry);expect(supply.queuedUnits).toBe(1);expect(supply.reserved).toBe(f.game.registry.get(f.c.definition).supplyCost??0);
 const altar=f.game.context.create({id:'altar',definition:'building.ants.sanctuary',owner:'player.1',position:{x:140,y:140},rotation:0});expect(f.game.revival.enqueue(altar,f.c.id)).toMatch(/already returning/);step(f,12);expect(f.c.hp).toBe(500);expect(colonySupply(f.game.entities,'player.1',f.game.registry).queuedUnits).toBe(0);
});
it('honors the hard unit limit and cancels after ownership changes',()=>{
 const f=fixture();die(f);step(f);const population=f.game.context.populationCandidates();const full=vi.spyOn(f.game.context,'populationCandidates').mockReturnValue([...population,...Array.from({length:f.game.registry.rules.maxUnits},(_,i)=>({...f.c,id:1000+i,fallen:undefined,spellReturn:undefined,hp:500}))]);step(f,15);expect(f.c.hp).toBe(0);full.mockRestore();step(f);expect(f.c.hp).toBe(500);
 const g=fixture();die(g);step(g);g.c.owner='player.2';step(g);expect(g.c.fallen).toBe(true);expect(g.c.spellReturn).toBeUndefined();expect(g.game.abilities.observedEvents().some(e=>e.event==='revivalCancelled')).toBe(true);
});
it('restores before scheduling and during the delay with identical lockstep checksums',()=>{
 const f=fixture(),g=fixture();die(f);g.game.restore(f.game.snapshot());for(let i=0;i<7;i++){step(f);step(g);expect(f.game.checksum()).toBe(g.game.checksum());}g.game.restore(f.game.snapshot());for(let i=0;i<20;i++){step(f);step(g);expect(f.game.checksum()).toBe(g.game.checksum());}g.game.restore(f.game.snapshot());
});
it('rejects forged return provenance and trigger cooldown clocks atomically',()=>{
 const f=fixture();die(f);step(f);const hash=f.game.checksum();for(const patch of [{due:2},{deadline:999},{rank:3},{owner:'player.2'},{operation:'missing'},{cast:999}]){const save=f.game.snapshot();Object.assign(save.state.entities.find(e=>e.id===f.caster)!.spellReturn!,patch);expect(()=>f.game.restore(save)).toThrow();expect(f.game.checksum()).toBe(hash);}
 const save=f.game.snapshot();save.state.entities.find(e=>e.id===f.caster)!.spellTriggerCooldowns![f.a.id+':rebirth'].expires++;expect(()=>f.game.restore(save)).toThrow();expect(f.game.checksum()).toBe(hash);
});
it('preserves real hero progression, equipment and learned abilities without duplicating the hero',()=>{
 const source=structuredClone(builtinSource),a=definition();const library=abilityLibrarySchema.parse(source.abilityLibrary);library.abilities=library.abilities.filter(x=>x.id!==a.id).concat(a);source.abilityLibrary=library;
 const d=source.definitions.find(x=>(x as Definition).hero&&(x as Definition).behaviors.abilities) as Definition;d.behaviors.abilities!.bindings.push({id:'rebirth',ability:a.id,initialRank:1,controls:['player']});
 const game=new Game({...emptyUtcMap(),sandbox:true,entities:[{id:'hero',definition:d.id,owner:'player.1',position:{x:120,y:120},rotation:0}]},[{player:0,kind:'human'}],new ContentRegistry(source));const e=game.entities[0];e.progression!.experience=123;const equipment=structuredClone(e.equipment),ranks=structuredClone(e.abilities!.ranks),id=e.id;e.hp=0;game.onCombatDeath(e);for(let i=0;i<15;i++)game.tick(undefined,{passiveUnits:true});expect(e.hp).toBeGreaterThan(0);expect(e.id).toBe(id);expect(e.progression?.experience).toBe(123);expect(e.equipment).toEqual(equipment);expect(e.abilities!.ranks).toEqual(ranks);expect(game.entities).toHaveLength(1);game.restore(game.snapshot());
});
it('restricts revival to holder death hooks and validates ranked delays and trigger cooldowns',()=>{
 for(const patch of [{amount:0},{healthPermille:0},{manaPermille:1001},{placementWaitTicks:1201}])expect(()=>definition(patch)).toThrow();
 expect(()=>definition({}, {onRelease:[operation]})).toThrow();expect(()=>definition({}, {triggers:[{id:'bad',event:'kill',operations:[operation]}]})).toThrow();expect(()=>definition({}, {triggers:[{id:'bad',event:'death',cooldownTicks:{rankParameter:'missing'},operations:[operation]}]})).toThrow();
});
it('workbench can test hero death, delayed return and rewind without a spell-specific fixture',async()=>{
 const s=new SpellEditorService('/tmp'),a=definition();await s.execute({op:'preview.load',document:{definition:a,presentation:{...presentation,effects:[],icon:undefined}},settings:{casterHero:true,relationship:'self'}});const state=()=>s.state() as PreviewState;
 await s.execute({op:'preview.cast'});await s.execute({op:'preview.kill',subject:'caster'});await s.execute({op:'preview.seek',tick:5});expect(state().entities[0].fallen).toBe(true);await s.execute({op:'preview.seek',tick:20});expect(state().entities[0].hp).toBe(500);const hash=state().checksum;await s.execute({op:'preview.seek',tick:5});expect(state().entities[0].hp).toBe(0);await s.execute({op:'preview.seek',tick:20});expect(state().checksum).toBe(hash);
});

it('exposes pending returns only to their owner or an observer with sight of the death point',()=>{
 const f=fixture();die(f);step(f);
 expect(f.game.abilities.observedHeroReturns()).toHaveLength(1);
 expect(f.game.abilities.observedHeroReturns('player.1')).toHaveLength(1);
 expect(f.game.abilities.observedHeroReturns('player.8')).toHaveLength(0);
});
