import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {resolveDamage} from '../../src/sim/game/damage';

function setup(targetDefinition='unit.ants.warrior',relationship='enemy'){
 const a=coreAbilities.abilities.find(a=>a.id==='ability.core.thorns-aura')!;
 const p=coreAbilities.presentations.find(p=>p.id===a.presentation)!;
 const f=createAbilityEncounter(a,p,encounterSettingsSchema.parse({combat:true,relationship,distance:6,targetDefinition,targetHealth:500}));
 f.game.tick(undefined,{passiveUnits:true});
 const caster=f.game.context.get(f.caster)!,target=f.game.context.get(f.target)!;
 return {...f,c:caster,t:target};
}
const reduced=(f:ReturnType<typeof setup>,e:ReturnType<typeof setup>['c'],amount:number,type:string)=>resolveDamage(f.game.registry.rules,{armor:f.game.context.stats(e).armor,armorType:f.game.context.def(e).body!.armorType},amount,type);
it('reflects actual mitigated melee damage once, and never reflects spell damage',()=>{
 const f=setup(),{game,c,t}=f;const damageType=game.context.def(t).behaviors.combat!.damageType;
 const dealt=reduced(f,c,100,damageType),returned=reduced(f,t,Math.floor(dealt*.2),'spell');
 // Both participants have reflection: returned damage must not recurse or proc lifesteal.
 t.spellStatuses=structuredClone(c.spellStatuses);
 game.combat.resolve([{source:t.id,target:c.id,damage:100,damageType,weapon:true}]);
 expect(c.hp).toBe(500-dealt);expect(t.hp).toBe(500-returned);
 const before=t.hp;game.combat.abilityHit({source:t.id,target:c.id,damage:100,damageType:'spell'});expect(t.hp).toBe(before);
});
it('does not reflect ranged weapons or zero damage',()=>{
 const f=setup('unit.ants.archer'),{game,c,t}=f;
 game.combat.resolve([{source:t.id,target:c.id,damage:100,damageType:game.context.def(t).behaviors.combat!.damageType,weapon:true}]);
 expect(t.hp).toBe(500);expect(c.hp).toBeLessThan(500);
 const melee=setup();melee.game.combat.resolve([{source:melee.t.id,target:melee.c.id,damage:0,damageType:'spell',weapon:true}]);expect(melee.t.hp).toBe(500);
});
it('caps reflection at remaining health and resolves reflected deaths through ordinary combat',()=>{
 const f=setup();f.c.hp=10;f.t.hp=1;
 const dead=f.game.combat.resolve([{source:f.t.id,target:f.c.id,damage:1000,damageType:'spell',weapon:true}]);
 expect(dead.map(e=>e.id).sort()).toEqual([f.c.id,f.t.id].sort());
 expect(f.c.hp).toBe(0);expect(f.t.hp).toBe(0);
});
it('does not stack aura copies, affects ranged allies, clears outside range, and restores deterministically',()=>{
 const f=setup('unit.ants.archer','ally');
 f.game.context.create({id:'second',definition:'unit.preview.caster',owner:'player.1',position:{x:120,y:124},rotation:90});
 f.game.tick(undefined,{passiveUnits:true});expect(f.game.context.stats(f.t).meleeReflectionPermille).toBe(200);
 const other=setup('unit.ants.archer','ally');other.game.restore(f.game.snapshot());
 for(let i=0;i<20;i++){f.game.tick(undefined,{passiveUnits:true});other.game.tick(undefined,{passiveUnits:true});expect(f.game.checksum()).toBe(other.game.checksum());}
 f.t.x=155;f.game.tick(undefined,{passiveUnits:true});expect(f.game.context.stats(f.t).meleeReflectionPermille).toBe(0);
});
