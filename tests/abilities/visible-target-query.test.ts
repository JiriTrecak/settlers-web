import {expect,it,vi} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import type {AbilityHost} from '../../src/sim/abilities/runtime';
import {precise} from '../../src/sim/game/motion';
import {spellSource} from '../../src/sim/abilities/source';
import type {Camp} from '../../src/content/schema';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.holy-light-lite')!;
const look=coreAbilities.presentations.find(p=>p.id===base.presentation)!;
function fixture(owner:'player.1'|'none',air=false,hidden=false){
 const spell=abilitySchema.parse({...base,autocast:{intervalTicks:1,enabledByDefault:true}});
 const f=createAbilityEncounter(spell,look,encounterSettingsSchema.parse({relationship:'enemy',distance:3,targetHealth:200,targetLocomotion:air?'air':'ground',initialStatuses:hidden?['ability.core.invisibility']:[]}));
 f.game.context.get(f.caster)!.owner=owner;
 if(owner==='none'){
  f.game.context.get(f.caster)!.unit!.camp='caster-camp';
  // Extend only this isolated fixture before its first simulation tick.
  (f.game.map.camps as Camp[]).push({id:'caster-camp',members:['caster'],home:{x:120,y:120},aggroRange:8,leash:18,aggression:'players'});
 }
 const far=f.game.context.create({id:'far',definition:'unit.ants.warrior',owner:'player.2',position:{x:220,y:220},rotation:0});
 f.game.context.reindex();f.game.observation.update();
 const host=(f.game.abilities as unknown as {host:AbilityHost}).host;
 return {...f,far,host};
}

it.each(['player.1','none'] as const)('matches complete actor visibility for %s, including air and concealed targets',owner=>{
 for(const air of [false,true])for(const hidden of [false,true]){
  const f=fixture(owner,air,hidden);f.game.state.tick=30;
  const caster=f.host.get(f.caster)!;
  const expected=f.host.targets!().map(id=>f.host.get(id)!).filter(a=>a.alive&&f.host.visible(owner,a,caster)).map(a=>a.id);
  expect(f.host.visibleTargets!(caster)).toEqual(expected);
  expect(expected).not.toContain(f.far.id);
  if(hidden)expect(expected).not.toContain(f.target);
 }
});

it('rejects out-of-radius neutral targets before LOS, retaining the exact inclusive radius',()=>{
 const f=fixture('none'),caster=f.host.get(f.caster)!,target=f.game.context.get(f.target)!;
 target.x=caster.x+24;target.y=caster.y;target.unit!.position=null;
 const sight=vi.spyOn(f.game.spatial,'visible').mockReturnValue(true);
 expect(f.host.visible('none',f.host.get(target.id)!,caster)).toBe(true);
 expect(sight).toHaveBeenCalled();sight.mockClear();
 target.unit!.position={x:Math.round((target.x+.001)*1000),y:target.y*1000};
 expect(precise(target).x).toBeGreaterThan(caster.x+24);
 expect(f.host.visible('none',f.host.get(target.id)!,caster)).toBe(false);
 expect(f.host.visiblePoint('none',precise(target),caster)).toBe(false);
 expect(sight).not.toHaveBeenCalled();
});

it('retains distant player allies rather than imposing the neutral sight radius on shared vision',()=>{
 const f=fixture('player.1');f.far.owner='player.1';
 const caster=f.host.get(f.caster)!;
 expect((caster.x-f.far.x)**2+(caster.y-f.far.y)**2).toBeGreaterThan(24**2);
 expect(f.host.visibleTargets!(caster)).toContain(f.far.id);
});

it.each(['player.1','none'] as const)('avoids constructing invisible actors while preserving %s autocast choices and state',owner=>{
 const fast=fixture(owner),reference=fixture(owner);
 delete reference.host.visibleTargets;
 const get=vi.spyOn(fast.host,'get');
 for(let tick=0;tick<100;tick++){
  fast.game.abilities.ambient();reference.game.abilities.ambient();
  fast.game.tick(undefined,{passiveUnits:true});reference.game.tick(undefined,{passiveUnits:true});
  expect(fast.game.checksum('full')).toBe(reference.game.checksum('full'));
 }
 expect(get.mock.calls.some(([id])=>id===fast.far.id)).toBe(false);
 expect(fast.game.abilities.observedEvents().some(e=>e.event==='accepted')).toBe(true);
 expect(fast.game.abilities.observedEvents()).toEqual(reference.game.abilities.observedEvents());
 expect(fast.game.snapshot()).toEqual(reference.game.snapshot());
});

it('resolves combat stats once per actor/caster record without caching mutable source state',()=>{
 const f=fixture('player.1'),entity=f.game.context.get(f.caster)!;
 for(const hp of [200,350]){
  entity.hp=hp;
  const expected=spellSource(f.game.context,entity),stats=vi.spyOn(f.game.context,'stats');
  const actor=f.host.get(f.caster)!;
  expect(stats).toHaveBeenCalledTimes(1);expect(actor.sourceContext).toEqual(expected);
  stats.mockClear();const caster=f.host.caster(f.caster)!;
  expect(stats).toHaveBeenCalledTimes(1);expect(caster.actor.sourceContext).toEqual(expected);
  expect(caster.actor.hp).toBe(hp);stats.mockRestore();
 }
});
