import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,releaseEffects} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import {entityStats} from '../../src/sim/game/stats';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.metamorphosis')!;
function fixture(profile='unit.ants.archer'){
 const a=abilitySchema.parse({...base,onRelease:base.onRelease.map(op=>op.op==='status'?{...op,form:{...op.form,combatProfile:profile}}:op)});
 const f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({combat:true,relationship:'enemy',distance:8,targetHealth:500}));
 const c=f.game.context.get(f.caster)!,t=f.game.context.get(f.target)!;
 // Hold the victim so range and projectile travel assertions remain independent of pursuit.
 f.game.command('player.2',{type:'hold',actors:[t.id]});
 return {...f,a,c,t};
}
function transform(f:ReturnType<typeof fixture>){for(const op of releaseEffects(f.a,1,'ally'))new SpellStatuses(f.game).apply(f.caster,f.caster,f.a,1,f.game.state.nextCast++,op);}
function until(f:ReturnType<typeof fixture>,predicate:()=>boolean){for(let i=0;i<160&&!predicate();i++)f.game.tick();expect(predicate()).toBe(true);}
it('replaces only the weapon policy and shares resolved stats without changing identity or body',()=>{
 const f=fixture(),original=f.game.registry.get(f.c.definition);transform(f);
 expect(f.c.definition).toBe('unit.preview.caster');expect(f.game.context.def(f.c).body).toBe(original.body);
 expect(f.game.context.def(f.c).behaviors.combat).toBe(f.game.registry.get('unit.ants.archer').behaviors.combat);
 expect(f.game.context.stats(f.c).damage).toBe(35);
 expect(entityStats(original,f.c,f.game.registry)).toEqual(f.game.context.stats(f.c));
 until(f,()=>f.game.state.missiles.length>0);
 expect(f.c.x).toBe(120);expect(f.game.state.missiles[0]).toMatchObject({definition:'unit.ants.archer',damage:35,resolved:false});
});
it.each(['unit.ants.archer','unit.ants.bombardier'])('retains %s flights and deterministic saves after form expiry',profile=>{
 const f=fixture(profile);transform(f);until(f,()=>f.game.state.missiles.length+f.game.state.shells.length>0);
 const shot=(f.game.state.missiles[0]??f.game.state.shells[0])!,hp=f.t.hp!;
 // Expire the form while a released shot is in flight; the shot owns its damage and weapon definition.
 f.c.spellStatuses!.forEach(s=>s.expires=f.game.state.tick+1);f.game.tick();
 expect(f.game.context.weaponDefinition(f.c)).toBe(f.c.definition);
 const restored=fixture(profile);restored.game.restore(f.game.snapshot());
 while(f.game.state.tick<=shot.impact){f.game.tick();restored.game.tick();expect(restored.game.checksum()).toBe(f.game.checksum());}
 expect(f.t.hp).toBeLessThan(hp);expect(shot.definition).toBe(profile);
});
it('cancels a changed weapon windup without refunding its cooldown or launching a stale arrow',()=>{
 const f=fixture();transform(f);until(f,()=>!!f.c.unit!.attack&&!f.c.unit!.attack.released);
 const cooldown=f.c.unit!.cooldown;expect(cooldown).toBeGreaterThan(0);
 f.c.spellStatuses!.forEach(s=>s.expires=f.game.state.tick+1);f.game.tick();
 expect(f.c.unit!.attack).toBeUndefined();expect(f.c.unit!.cooldown).toBeGreaterThan(0);
 expect(f.c.unit!.cooldown).toBeLessThanOrEqual(cooldown);expect(f.game.state.missiles).toHaveLength(0);
});
it('restores a saved transformed windup and releases the same projectile',()=>{
 const f=fixture();transform(f);until(f,()=>!!f.c.unit!.attack);const restored=fixture();restored.game.restore(f.game.snapshot());
 for(let i=0;i<65;i++){f.game.tick();restored.game.tick();expect(restored.game.checksum()).toBe(f.game.checksum());}
 expect(f.t.hp).toBeLessThan(500);
});
it('a newer visual-only form temporarily restores the original weapon, then exposes the previous profile',()=>{
 const f=fixture();transform(f);const avatar=coreAbilities.abilities.find(a=>a.id==='ability.core.avatar')!;
 for(const op of releaseEffects(avatar,1,'ally'))new SpellStatuses(f.game).apply(f.caster,f.caster,avatar,1,f.game.state.nextCast++,op);
 expect(f.game.context.weaponDefinition(f.c)).toBe(f.c.definition);
 f.c.spellStatuses=f.c.spellStatuses!.filter(s=>s.ability!==avatar.id);
 expect(f.game.context.weaponDefinition(f.c)).toBe('unit.ants.archer');
});
it('rejects missing and non-unit weapon profiles before publication',()=>{
 expect(()=>fixture('unit.missing')).toThrow(/combat profile/i);
 expect(()=>fixture('building.ants.fort')).toThrow(/combat profile/i);
});
