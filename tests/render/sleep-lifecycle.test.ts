import {expect,it,vi} from 'vitest';
import {Texture,TextureLoader} from 'three';
import {AbilityEffects} from '../../src/render/abilities/abilityEffects';
import {coreAbilities} from '../../src/content/abilities/core';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import {releaseEffects} from '../../src/content/abilities/schema';

it.each(['damage','expiry','dispel'] as const)('removes every published Sleep layer on actual %s without changing its mechanics',end=>{
 const ability=coreAbilities.abilities.find(a=>a.id==='ability.core.sleep')!,presentation=coreAbilities.presentations.find(p=>p.id===ability.presentation)!;
 const f=createAbilityEncounter(ability,presentation,encounterSettingsSchema.parse({relationship:'enemy',distance:3,targetHealth:500}));
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture()),fx=new AbilityEffects();
 const sync=()=>{fx.syncStatuses(f.game.entities,f.game.state.tick,()=>presentation);fx.update(f.game.state.tick);};
 try{
  expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();
  for(let i=0;i<40;i++)f.game.tick(undefined,{passiveUnits:true});
  const target=f.game.context.get(f.target)!,status=target.spellStatuses!.find(s=>s.ability===ability.id)!;
  sync();expect(fx.liveCues).toBe(4);expect(fx.rootsForEntity(target.id)).toHaveLength(4);
  const expires=status.expires;
  if(end==='damage'){
   expect(f.game.combat.abilityHit({source:f.caster,target:f.target,damage:8,damageType:'spell'}).damage).toBe(8);
   expect(f.game.state.tick).toBeLessThan(expires);expect(target.hp).toBe(492);
  }else if(end==='dispel'){
   const dispel=coreAbilities.abilities.find(a=>a.id==='ability.core.dispel-magic')!;
   for(const effect of releaseEffects(dispel,1,'enemy'))new SpellStatuses(f.game).apply(f.caster,target.id,dispel,1,f.game.state.nextCast++,effect);
   expect(f.game.state.tick).toBeLessThan(expires);expect(target.hp).toBe(500);
  }else{
   while(f.game.state.tick<expires)f.game.tick(undefined,{passiveUnits:true});
   expect(target.hp).toBe(500);
  }
  expect(target.spellStatuses).toBeUndefined();sync();expect(fx.liveCues).toBe(0);expect(fx.rootsForEntity(target.id)).toHaveLength(0);
 }finally{fx.dispose();loader.mockRestore();}
});
