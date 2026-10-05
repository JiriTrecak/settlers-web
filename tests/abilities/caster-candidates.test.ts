import {expect,it,vi} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import type {AbilityHost} from '../../src/sim/abilities/runtime';

function fixture(name:string,auto=false){
 const base=coreAbilities.abilities.find(a=>a.id===`ability.core.${name}`)!;
 const spell=abilitySchema.parse({...base,...(auto?{autocast:{intervalTicks:7,enabledByDefault:true}}:{})});
 const look=coreAbilities.presentations.find(p=>p.id===spell.presentation)!;
 const f=createAbilityEncounter(spell,look,encounterSettingsSchema.parse({relationship:'ally',distance:3,targetHealth:200,targetCount:3}));
 const host=(f.game.abilities as unknown as {host:AbilityHost}).host;
 return {...f,host};
}

it('does not materialize actors for inactive release, aura, or autocast passes',()=>{
 const f=fixture('holy-light-lite'),caster=vi.spyOn(f.host,'caster');
 f.game.abilities.resolve();f.game.abilities.ambient();
 expect(caster).not.toHaveBeenCalled();
 f.game.abilities.tick();
 // The remaining lifecycle read actually needs live stats for mana regeneration.
 expect(caster.mock.calls).toEqual([[f.caster]]);
 const stats=vi.spyOn(f.game.context,'stats');
 expect(f.host.casterBindings!(f.caster)?.state).toBe(f.game.context.get(f.caster)!.abilities);
 expect(stats).not.toHaveBeenCalled();
});

it.each(['holy-light-lite','blizzard','vampiric-aura','thorns-aura','feral-spirit'])('%s retains identical state/events with eager and lightweight candidate access',name=>{
 const fast=fixture(name,name==='holy-light-lite'),eager=fixture(name,name==='holy-light-lite');
 delete eager.host.casterBindings;
 for(let tick=0;tick<130;tick++){
  for(const f of [fast,eager]){
   // Live rank changes, a manual cast, an interruption, and a restored host state.
   if(tick===2)f.game.context.get(f.caster)!.abilities!.ranks.preview=0;
   if(tick===5)f.game.context.get(f.caster)!.abilities!.ranks.preview=1;
   if(tick===8){
    const spell=f.host.definition(`ability.core.${name}`)!;
    const aim=spell.targeting.kind==='self'?f.caster:spell.targeting.kind==='point'?{x:123,y:120}:f.target;
    f.game.abilities.cast(f.caster,'preview',aim);
   }
   if(tick===11)f.game.abilities.cancel(f.caster);
   if(tick===50)f.game.restore(f.game.snapshot());
   f.game.abilities.ambient();f.game.tick(undefined,{passiveUnits:true});
  }
  expect(fast.game.checksum('full'),`tick ${tick}`).toBe(eager.game.checksum('full'));
  expect(fast.game.abilities.observedEvents()).toEqual(eager.game.abilities.observedEvents());
 }
 expect(fast.game.snapshot()).toEqual(eager.game.snapshot());
});
