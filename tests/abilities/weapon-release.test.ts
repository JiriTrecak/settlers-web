import {expect,it,vi} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import {SpellReactions} from '../../src/sim/abilities/reactions';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import type {PreviewState} from '../../tooling/spell-editor/shared/view';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.death-burst')!;
const trigger={id:'pulse',event:'weaponRelease',operations:[{op:'heal',target:'caster',amount:25}],manaCost:4};
function fixture(settings={},t={},patch={}){
 const a=abilitySchema.parse({...base,ranks:[{}],triggers:[{...trigger,...t}],...patch}),p=coreAbilities.presentations.find(p=>p.id===a.presentation)!,f=createAbilityEncounter(a,p,encounterSettingsSchema.parse({relationship:'enemy',targetHealth:500,distance:3,combat:true,mana:100,...settings}));
 const c=f.game.context.get(f.caster)!,v=f.game.context.get(f.target)!;c.hp=100;f.game.command('player.2',{type:'hold',actors:[f.target]});
 return {...f,a,p,c,t:v};
}
function until(f:ReturnType<typeof fixture>,fn:()=>boolean){for(let i=0;i<300&&!fn();i++)f.game.tick();expect(fn()).toBe(true);}
const release=(f:ReturnType<typeof fixture>,kind:'melee'|'projectile'|'siege'='melee')=>new SpellReactions(f.game).weaponRelease(f.c,f.t,kind);
const flush=(f:ReturnType<typeof fixture>)=>f.game.abilities.resolve();
it('ordinary attacks invoke at release, once per swing, before projectile impact',()=>{
 const f=fixture({casterDefinition:'unit.ants.archer',distance:10});until(f,()=>!!f.c.unit?.attack&&!f.c.unit.attack.released);expect(f.c.abilities!.mana).toBe(100);
 until(f,()=>f.game.state.missiles.length>0);expect(f.c.abilities!.mana).toBe(96);expect(f.c.hp).toBe(125);expect(f.t.hp).toBe(500);
 expect(f.game.abilities.observedEvents().filter(e=>e.event==='weaponRelease')).toHaveLength(1);
 f.game.tick();expect(f.c.abilities!.mana).toBe(96);expect(f.game.state.spellLifecycleReactions).toHaveLength(0);
});
it('interrupted and out-of-range windups never count or spend mana',()=>{
 for(const mode of ['move','range']){const f=fixture({casterDefinition:'unit.ants.archer',distance:10});until(f,()=>!!f.c.unit?.attack&&!f.c.unit.attack.released);
 if(mode==='move')f.game.command('player.1',{type:'move',actors:[f.caster],destination:{x:110,y:110}});else{f.t.x=170;f.t.y=170;f.t.unit!.position=null;}
 for(let i=0;i<8;i++)f.game.tick();expect(f.c.abilities!.mana).toBe(100);expect(f.c.spellCounters).toBeUndefined();}
});
it('filters weapon kind, enemy traits and silence before advancing counters',()=>{
 for(const [kind,match] of [['melee',false],['projectile',true],['siege',false]] as const){const f=fixture({}, {weapon:'projectile'});release(f,kind);expect(f.game.state.spellLifecycleReactions.length).toBe(match?1:0);}
 const f=fixture({targetNature:'mechanical'},{filter:{natures:['organic']}});release(f);expect(f.c.spellCounters).toBeUndefined();
 const g=fixture({}, {blockedBySilence:true});const silence=coreAbilities.abilities.find(a=>a.id==='ability.core.silence')!;new SpellStatuses(g.game).apply(g.target,g.caster,silence,1,g.game.state.nextCast++,silence.onRelease[0] as never);release(g);expect(g.c.spellCounters).toBeUndefined();
 const h=fixture({relationship:'ally'});release(h);expect(h.c.spellCounters).toBeUndefined();
});
it('counts real siege releases through the same hook, and only opted-in weapon policies',()=>{
 const f=fixture({casterDefinition:'unit.ants.bombardier',distance:8},{weapon:'siege'});until(f,()=>f.game.state.shells.length>0);expect(f.c.abilities!.mana).toBe(96);expect(f.c.hp).toBe(125);
});
it('runs on evaded melee release even though no weaponHit is produced',()=>{
 const f=fixture();vi.spyOn(f.game.combat as any,'evaded').mockReturnValue(true);until(f,()=>f.c.abilities!.mana<100);expect(f.c.hp).toBe(125);expect(f.t.hp).toBe(500);
});
it('qualifies every-N, ranked mana and cooldown once and saves their clocks',()=>{
 const f=fixture({}, {every:2,manaCost:{rankParameter:'cost'},cooldownTicks:80},{ranks:[{cost:4},{cost:8}]});f.c.abilities!.ranks.preview=2;
 release(f);expect(f.game.state.spellLifecycleReactions).toHaveLength(0);release(f);expect(f.c.abilities!.mana).toBe(92);expect(f.game.state.spellLifecycleReactions).toHaveLength(1);
 release(f);expect(f.c.abilities!.mana).toBe(92);expect(f.c.spellCounters![f.a.id+':pulse']).toBe(0);f.c.abilities!.ranks.preview=1;f.game.restore(f.game.snapshot());
 const g=fixture({mana:3});release(g);expect(g.game.state.spellLifecycleReactions).toHaveLength(0);expect(g.c.abilities!.mana).toBe(3);
});
it('captures timed status grants before attack reveal removes them',()=>{
 const status={op:'status',id:'veil',target:'caster',amount:200,polarity:'positive',dispel:true,modifiers:{},concealment:{fadeTicks:0,breakOnAttack:true,breakOnCast:false,attackBonus:0}};
 const f=fixture({casterDefinition:'unit.ants.archer',distance:10},{whileStatus:'veil'},{activation:'targeted',onRelease:[status]});
 new SpellStatuses(f.game).apply(f.caster,f.caster,f.a,1,f.game.state.nextCast++,f.a.onRelease[0] as never);until(f,()=>f.game.state.missiles.length>0);
 expect(f.c.spellStatuses?.length??0).toBe(0);expect(f.c.abilities!.mana).toBe(96);expect(f.c.hp).toBe(125);
});
it('committed programs survive dispel but do not migrate to a converted caster',()=>{
 const status={op:'status',id:'blessing',target:'caster',amount:200,polarity:'positive',dispel:true,modifiers:{}};
 const f=fixture({}, {whileStatus:'blessing'},{activation:'targeted',onRelease:[status]});new SpellStatuses(f.game).apply(f.caster,f.caster,f.a,1,f.game.state.nextCast++,f.a.onRelease[0] as never);release(f);delete f.c.spellStatuses;flush(f);expect(f.c.hp).toBe(125);
 const g=fixture();release(g);g.c.owner='player.2';flush(g);expect(g.c.hp).toBe(100);
});
it('lost or converted targets skip direct effects while point and caster operations still run',()=>{
 for(const mode of ['remove','convert']){const f=fixture({}, {operations:[{op:'heal',target:'caster',amount:25},{op:'damage',target:'target',amount:50,damageType:'spell'}]});release(f);
 if(mode==='remove')f.game.context.remove(f.t);else f.t.owner='player.1';flush(f);expect(f.c.hp).toBe(125);expect(f.t.hp).toBe(500);}
});
it('captures origin and aim before movement or source loss for bounded point programs',()=>{
 const f=fixture({}, {operations:[{op:'summon',target:'point',amount:1,definition:'unit.spell.feral-spirit',durationTicks:80,replace:false,radius:2}]});release(f);const x=f.t.x;f.t.x=170;f.c.hp=0;f.game.onCombatDeath(f.c);flush(f);
 const spirit=f.game.entities.find(e=>e.summoned);expect(spirit?.owner).toBe('player.1');expect(Math.abs(spirit!.x-x)).toBeLessThanOrEqual(4);
});
it('does not recursively fire weapon or ordinary hit reactions from its spell damage',()=>{
 const f=fixture({}, {operations:[{op:'damage',target:'target',amount:10,damageType:'spell'}]});release(f);flush(f);expect(f.game.combat.spellEvents).toEqual([]);expect(f.game.state.spellLifecycleReactions).toEqual([]);
 f.game.combat.suppressSpellReactions++;release(f);expect(f.game.state.spellLifecycleReactions).toEqual([]);
});
it('bounds release processing, commits nothing past capacity, and replays pending programs',()=>{
 const f=fixture({}, {manaCost:0,chancePermille:750}),g=fixture({}, {manaCost:0,chancePermille:750});
 for(let i=0;i<800;i++)release(f);expect(f.game.state.spellLifecycleReactions).toHaveLength(512);const counter=f.c.spellCounters![f.a.id+':pulse'];release(f);expect(f.c.spellCounters![f.a.id+':pulse']).toBe(counter);
 g.game.restore(f.game.snapshot());for(let i=0;i<4;i++){flush(f);flush(g);expect(g.game.checksum()).toBe(f.game.checksum());expect(f.game.state.spellLifecycleReactions.length).toBe(512-128*(i+1));}
});
it('rejects invalid policies and forged pending release records atomically',()=>{
 expect(abilitySchema.safeParse({...base,triggers:[{...trigger,event:'kill',weapon:'projectile'}]}).success).toBe(false);
 const f=fixture({}, {weapon:'melee'});release(f);const hash=f.game.checksum();for(const patch of [{weapon:undefined},{weapon:'siege'},{event:'kill'},{rank:10}]){const s=f.game.snapshot();Object.assign(s.state.spellLifecycleReactions[0],patch);expect(()=>f.game.restore(s)).toThrow();expect(f.game.checksum()).toBe(hash);}
});
it('deduplicates repeated passive bindings and respects learning state',()=>{
 const f=fixture();const def=f.game.context.def.bind(f.game.context),d=structuredClone(def(f.c));d.behaviors.abilities!.bindings.push({...d.behaviors.abilities!.bindings[0],id:'second'});vi.spyOn(f.game.context,'def').mockImplementation(e=>e.id===f.caster?d:def(e));f.c.abilities!.ranks.second=1;release(f);expect(f.game.state.spellLifecycleReactions).toHaveLength(1);
 f.c.abilities!.ranks.preview=0;f.c.abilities!.ranks.second=0;release(f);expect(f.game.state.spellLifecycleReactions).toHaveLength(1);
});
it('normal workbench combat replays release events with identical state after scrubbing',async()=>{
 const f=fixture({casterDefinition:'unit.ants.archer',distance:10});const s=new SpellEditorService('/tmp');await s.execute({op:'preview.load',document:{definition:f.a,presentation:{...f.p,effects:[],icon:undefined}},settings:{combat:true,relationship:'enemy',targetCount:1,targetHealth:500,casterDefinition:'unit.ants.archer',distance:10}});
 await s.execute({op:'preview.cast'});await s.execute({op:'preview.seek',tick:100});const first=s.state() as PreviewState;expect(first.events.some(e=>e.event==='weaponRelease')).toBe(true);
 await s.execute({op:'preview.seek',tick:0});await s.execute({op:'preview.seek',tick:100});expect((s.state() as PreviewState).checksum).toBe(first.checksum);
});
it('published Battle Rhythm grants ranked haste on every third release and refreshes one status',()=>{
 const spell=coreAbilities.abilities.find(a=>a.id==='ability.core.battle-rhythm')!;const f=fixture({}, {},spell),cycle=f.game.context.stats(f.c).cooldownTicks;
 release(f);release(f);flush(f);expect(f.c.spellStatuses).toBeUndefined();release(f);flush(f);expect(f.c.spellStatuses?.map(s=>s.status)).toEqual(['momentum']);expect(f.game.context.stats(f.c).cooldownTicks).toBeLessThan(cycle);
 const first=f.c.spellStatuses![0].cast;release(f);release(f);release(f);flush(f);expect(f.c.spellStatuses).toHaveLength(1);expect(f.c.spellStatuses![0].cast).toBeGreaterThan(first);expect(f.c.spellStatuses![0].expires).toBe(160);f.game.restore(f.game.snapshot());
});
it('requires explicit building opt-in and captures only observers of the release',()=>{
 for(const includeBuildings of [false,true]){const f=fixture({}, {includeBuildings}),building=f.game.context.create({id:'fort',definition:'building.ants.great-mound',owner:'player.2',position:{x:140,y:140},rotation:0});
 new SpellReactions(f.game).weaponRelease(f.c,building,'siege');expect(f.game.state.spellLifecycleReactions).toHaveLength(includeBuildings?1:0);}
 const f=fixture();vi.spyOn(f.game.observation,'visible').mockReturnValue(false);release(f);expect(f.game.state.spellLifecycleReactions[0].viewers).toEqual([]);flush(f);expect(f.game.abilities.observedEvents('player.1').some(e=>e.event==='weaponRelease')).toBe(false);
});
it('normal combat, chance and resumed pending attacks produce identical peer hashes',()=>{
 const f=fixture({casterDefinition:'unit.ants.archer',distance:10},{chancePermille:500,manaCost:1}),g=fixture({casterDefinition:'unit.ants.archer',distance:10},{chancePermille:500,manaCost:1});
 for(let i=0;i<150;i++){f.game.tick();g.game.tick();expect(g.game.checksum()).toBe(f.game.checksum());if(i===8||i===80)g.game.restore(f.game.snapshot());}
});
