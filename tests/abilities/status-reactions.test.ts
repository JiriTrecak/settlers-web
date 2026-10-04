import {it,expect} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {spellControl} from '../../src/sim/abilities/statuses';
import {isStunned} from '../../src/sim/game/effects';
function fixture(name:string,extra:Record<string,unknown>={}){
 const a=coreAbilities.abilities.find(a=>a.id==='ability.core.'+name)!;
 const f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({relationship:'enemy',targetHealth:500,distance:3,combat:true,...extra}));
 return {...f,a,cast:()=>f.game.abilities.cast(f.caster,'preview',a.targeting.kind==='self'?f.caster:f.target),casterEntity:()=>f.game.context.get(f.caster)!,targetEntity:()=>f.game.context.get(f.target)!};
}
function advance(f:ReturnType<typeof fixture>,n:number){for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});}
it('Silence prevents casting without becoming a stun or disarm',()=>{
 const f=fixture('silence');f.cast();advance(f,12);
 expect(spellControl(f.targetEntity(),f.game.registry,'silence')).toBe(true);
 expect(isStunned(f.targetEntity(),f.game.registry)).toBe(false);
 expect(spellControl(f.targetEntity(),f.game.registry,'disarm')).toBe(false);
 // A caster receiving the same status also uses the shared caster eligibility gate.
 f.casterEntity().spellStatuses=structuredClone(f.targetEntity().spellStatuses);
 f.casterEntity().abilities!.cooldowns={};advance(f,10);
 expect(f.cast()).toMatch(/unable to cast/);
});
it('Sleep breaks on actual damage, not a zero-damage hit',()=>{
 const f=fixture('sleep');f.cast();advance(f,12);
 expect(isStunned(f.targetEntity(),f.game.registry)).toBe(true);
 f.game.combat.abilityHit({source:f.caster,target:f.target,damage:0,damageType:'spell'});
 expect(isStunned(f.targetEntity(),f.game.registry)).toBe(true);
 f.game.combat.abilityHit({source:f.caster,target:f.target,damage:10,damageType:'spell'});
 expect(isStunned(f.targetEntity(),f.game.registry)).toBe(false);
});
it('Frost Armor reacts to melee weapon damage, never secondary spell damage',()=>{
 const f=fixture('frost-armor',{relationship:'ally'});f.cast();advance(f,12);
 const attacker=f.game.context.create({id:'attacker',definition:'unit.ants.warrior',owner:'player.2',position:{x:124,y:120},rotation:270});
 f.game.combat.spellEvents.push({source:attacker.id,target:f.target,damage:10,weapon:true,melee:true});
 advance(f,1);expect(attacker.spellStatuses?.map(s=>s.status)).toEqual(['retaliationSlow']);
 delete attacker.spellStatuses;
 f.game.combat.abilityHit({source:attacker.id,target:f.target,damage:10,damageType:'spell'});advance(f,1);
 expect(attacker.spellStatuses).toBeUndefined();
});
it('Bash proc counters and probability replay across a saved pending combat event',()=>{
 const a=fixture('bash'),b=fixture('bash');
 a.game.combat.spellEvents.push({source:a.caster,target:a.target,damage:10,weapon:true,melee:true});
 b.game.restore(a.game.snapshot());
 for(let i=0;i<32;i++){
  for(const f of [a,b]){f.targetEntity().hp=500;f.game.combat.spellEvents.push({source:f.caster,target:f.target,damage:10,weapon:true,melee:true});advance(f,1);}
  expect(a.game.checksum()).toBe(b.game.checksum());
 }
 expect(a.game.abilities.drainEvents().some(e=>e.event==='damaged'&&e.ability===a.a.id)).toBe(true);
 expect(a.game.state.spellCombatEvents).toHaveLength(0);
});
it('signed and rank-dependent modifiers use shared combat stats',()=>{
 const f=fixture('armor-hex');const before=f.game.context.stats(f.targetEntity()).armor;f.cast();advance(f,12);
 expect(f.game.context.stats(f.targetEntity()).armor).toBe(before-8);
 expect(()=>f.game.combat.abilityHit({source:f.caster,target:f.target,damage:10,damageType:'melee'})).not.toThrow();
 const r=fixture('roar',{relationship:'ally'});const damage=r.game.context.stats(r.casterEntity()).damage;r.cast();advance(r,12);
 expect(r.game.context.stats(r.casterEntity()).damage).toBeCloseTo(damage*1.15);
});
it('spell immunity and finite absorption enter the ordinary damage pipeline',()=>{
 const f=fixture('anti-magic-shell',{relationship:'ally'});f.cast();advance(f,12);
 expect(f.game.combat.abilityHit({source:f.caster,target:f.target,damage:50,damageType:'spell'}).damage).toBe(0);
 expect(f.game.combat.abilityHit({source:f.caster,target:f.target,damage:50,damageType:'melee'}).damage).toBeGreaterThan(0);
 const s=fixture('absorption-shield',{relationship:'ally'});s.cast();advance(s,12);
 expect(s.game.combat.abilityHit({source:s.caster,target:s.target,damage:100,damageType:'spell'}).damage).toBe(0);
 expect(s.targetEntity().spellStatuses![0].shield).toBe(50);
 const restored=fixture('absorption-shield',{relationship:'ally'});restored.game.restore(s.game.snapshot());
 expect(restored.game.combat.abilityHit({source:restored.caster,target:restored.target,damage:100,damageType:'spell'}).damage).toBe(50);
});
