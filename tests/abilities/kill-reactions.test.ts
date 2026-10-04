import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.death-burst')!;
const harvest={id:'harvest',event:'kill',filter:{summoned:false,natures:['organic','undead']},operations:[{op:'heal',target:'caster',amount:60},{op:'mana',target:'caster',amount:20}]};
function fixture(patch={},settings={}){
 const a=abilitySchema.parse({...base,ranks:[{}],triggers:[harvest],...patch}),f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({relationship:'enemy',targetHealth:30,distance:3,combat:false,mana:20,...settings}));
 const c=f.game.context.get(f.caster)!,t=f.game.context.get(f.target)!;c.hp=100;
 return {...f,a,c,t};
}
function hit(f:ReturnType<typeof fixture>,source=f.caster,target=f.target){const r=f.game.combat.abilityHit({source,target,damage:1000,damageType:'spell'});for(const e of r.dead)f.game.onCombatDeath(e);return r;}
function step(f:ReturnType<typeof fixture>){f.game.tick(undefined,{passiveUnits:true});}
it('runs a kill program once with live caster recipients and the saved victim point',()=>{
 const f=fixture();hit(f);expect(f.game.state.spellLifecycleReactions).toHaveLength(1);expect(f.game.context.get(f.target)).toBeUndefined();step(f);
 expect(f.c.hp).toBe(160);expect(f.c.abilities!.mana).toBe(40);expect(f.game.abilities.observedEvents()).toContainEqual(expect.objectContaining({event:'kill',caster:f.caster,point:{x:123,y:120,height:0}}));step(f);expect(f.c.hp).toBe(160);
});
it('credits only the damage hit that crosses zero and ignores later same-tick overkill',()=>{
 const f=fixture();const other=f.game.context.create({id:'helper',definition:f.c.definition,owner:'player.1',position:{x:122,y:123},rotation:0});other.hp=100;
 for(const dead of f.game.combat.resolve([{source:other.id,target:f.target,damage:10,damageType:'spell'},{source:f.caster,target:f.target,damage:30,damageType:'spell'},{source:other.id,target:f.target,damage:1000,damageType:'spell'}]))f.game.onCombatDeath(dead);
 expect(f.game.state.spellLifecycleReactions).toHaveLength(1);expect(f.game.state.spellLifecycleReactions[0].source).toBe(f.caster);step(f);expect(other.hp).toBe(100);expect(f.c.hp).toBe(160);
});
it('does not reward allied kills, forced removal, unlearned grants or a source dead in the same damage batch',()=>{
 const f=fixture();f.t.owner='player.1';hit(f);expect(f.game.state.spellLifecycleReactions).toEqual([]);
 const g=fixture();g.t.hp=0;g.game.onCombatDeath(g.t);expect(g.game.state.spellLifecycleReactions).toEqual([]);
 const h=fixture();h.c.abilities!.ranks.preview=0;hit(h);expect(h.game.state.spellLifecycleReactions).toEqual([]);
 const j=fixture();for(const d of j.game.combat.resolve([{source:j.caster,target:j.target,damage:1000,damageType:'spell'},{source:j.target,target:j.caster,damage:1000,damageType:'spell'}]))j.game.onCombatDeath(d);expect(j.game.state.spellLifecycleReactions).toEqual([]);
});
it('uses the existing neutral camp hostility rules',()=>{
 const f=fixture({}, {relationship:'neutral',combat:true});hit(f);expect(f.game.state.spellLifecycleReactions).toHaveLength(1);step(f);expect(f.c.hp).toBe(160);
});
it('filters summoned and mechanical victims before counting the trigger',()=>{
 for(const settings of [{targetNature:'mechanical'},{}]){const f=fixture({},settings);if(!('targetNature' in settings))f.t.summoned={source:f.caster,ability:'ability.core.feral-spirit',rank:1,cast:1,started:0,expires:100};hit(f);expect(f.game.state.spellLifecycleReactions).toEqual([]);expect(f.c.spellCounters).toBeUndefined();}
});
it('resumes pending kill effects identically after their victim was removed',()=>{
 const f=fixture();hit(f);const g=fixture();g.game.restore(f.game.snapshot());step(f);step(g);expect(g.game.checksum()).toBe(f.game.checksum());
});
it('honors timed status grants and deterministic every-N kill counters',()=>{
 const status={op:'status',target:'caster',id:'blessing',amount:80,polarity:'positive',dispel:true,modifiers:{}};
 const f=fixture({activation:'targeted',onRelease:[status],triggers:[{...harvest,whileStatus:'blessing',every:2}]});
 new SpellStatuses(f.game).apply(f.caster,f.caster,f.a,1,f.game.state.nextCast++,f.a.onRelease[0] as never);hit(f);expect(f.game.state.spellLifecycleReactions).toEqual([]);
 const other=f.game.context.create({id:'victim',definition:f.t.definition,owner:'player.2',position:{x:124,y:120},rotation:0});hit(f,f.caster,other.id);expect(f.game.state.spellLifecycleReactions).toHaveLength(1);step(f);expect(f.c.hp).toBe(160);
});
it('projectiles keep launch-owner credit and cannot give kill rewards after source conversion or death',()=>{
 for(const change of ['owner','death','none']){const f=fixture({}, {casterDefinition:'unit.ants.archer',combat:true,distance:8});const missile=f.game.combat.missiles.launch(f.c,f.t,1000);
 if(change==='owner')f.c.owner='player.2';if(change==='death'){f.c.hp=0;f.game.onCombatDeath(f.c);}
 f.game.state.tick=missile.impact;for(const d of f.game.combat.resolve())f.game.onCombatDeath(d);
 expect(f.game.context.get(f.target)).toBeUndefined();expect(f.game.state.spellLifecycleReactions).toHaveLength(change==='none'?1:0);
 }
});
it('kill programs can summon at the saved victim point with killer ownership',()=>{
 const f=fixture({triggers:[{...harvest,operations:[{op:'summon',target:'point',amount:1,definition:'unit.spell.feral-spirit',durationTicks:80,replace:false,radius:2}]}]});hit(f);step(f);
 const spirit=f.game.entities.find(e=>e.summoned);expect(spirit?.owner).toBe('player.1');expect(spirit?.summoned?.source).toBe(f.caster);expect(Math.hypot(spirit!.x-f.t.x,spirit!.y-f.t.y)).toBeLessThanOrEqual(4);
});
it('refuses invalid lifecycle destinations and corrupt saved victim points atomically',()=>{
 expect(abilitySchema.safeParse({...base,triggers:[{...harvest,operations:[{op:'heal',target:'target',amount:1}]}]}).success).toBe(false);
 expect(abilitySchema.safeParse({...base,triggers:[{...harvest,event:'weaponHit'}]}).success).toBe(false);
 const f=fixture();hit(f);const before=f.game.checksum();for(const patch of [{event:'death'},{subject:{id:f.game.state.nextId,x:1,y:1}},{subject:{id:f.target,x:999,y:999}}]){const save=f.game.snapshot();Object.assign(save.state.spellLifecycleReactions[0],patch);expect(()=>f.game.restore(save)).toThrow();expect(f.game.checksum()).toBe(before);}
});

it('does not count an item rescue as a kill',()=>{
 const f=fixture({}, {targetDefinition:'unit.ants.marshal'});f.t.equipment=['item.phoenix-chrysalis'];f.t.equipmentState=[null];
 expect(hit(f).dead).toEqual([]);expect(f.t.hp).toBeGreaterThan(0);expect(f.game.state.spellLifecycleReactions).toEqual([]);
});
it('does not transfer a queued reward to a converted caster or resurrect a dead caster',()=>{
 for(const change of ['owner','death']){const f=fixture();hit(f);if(change==='owner')f.c.owner='player.2';else{f.c.hp=0;f.game.onCombatDeath(f.c);}step(f);expect(f.c.hp).toBe(change==='owner'?100:0);}
});
it('does not reveal the position of an unseen victim through kill presentation',()=>{
 const f=fixture();f.t.x=180;f.game.observation.update();hit(f);step(f);
 expect(f.game.abilities.observedEvents('player.1').some(e=>e.event==='kill')).toBe(false);
});
it('ordinary weapon combat can activate the same passive without an editor-specific command',()=>{
 const f=fixture({}, {combat:true,distance:3,targetHealth:1});f.game.command('player.1',{type:'attack',actors:[f.caster],target:f.target});
 for(let i=0;i<200&&f.game.context.get(f.target);i++)f.game.tick();
 expect(f.game.context.get(f.target)).toBeUndefined();expect(f.game.abilities.observedEvents().some(e=>e.event==='kill')).toBe(true);expect(f.c.abilities!.mana).toBe(40);
});
