import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,releaseEffects,statusDefinition} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellStatuses,spellControl} from '../../src/sim/abilities/statuses';
import {spellAppearance,activeSpellFormEntry} from '../../src/sim/abilities/forms';
const spell=(id:string)=>coreAbilities.abilities.find(a=>a.id==='ability.core.'+id)!;
function fixture(id='hex'){
 const a=spell(id),f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({relationship:'enemy',combat:true,distance:3,targetHealth:500}));
 return {...f,c:()=>f.game.context.get(f.caster)!,t:()=>f.game.context.get(f.target)!};
}
function run(f:ReturnType<typeof fixture>,n:number){for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});}
function apply(f:ReturnType<typeof fixture>,id:string,target:number){const a=spell(id);for(const op of releaseEffects(a,1,'enemy'))new SpellStatuses(f.game).apply(f.caster,target,a,1,f.game.state.nextCast++,op);}
it('Hex changes appearance and capabilities without replacing identity or authored data',()=>{
 const f=fixture(),t=f.t(),definition=t.definition,owner=t.owner;t.appearance={scale:1.2};t.inventory={};
 expect(f.game.abilities.cast(f.caster,'preview',t.id)).toBeNull();run(f,20);
 expect(t.definition).toBe(definition);expect(t.owner).toBe(owner);expect(t.appearance).toEqual({scale:1.2});
 expect(spellAppearance(t,f.game.registry)).toEqual({asset:'asset.neutral.tree-frog',scale:.78});
 expect(f.game.view('player.1').entities.find(e=>e.id===t.id)?.appearance?.asset).toBe('asset.neutral.tree-frog');
 expect(spellControl(t,f.game.registry,'disarm')).toBe(true);expect(spellControl(t,f.game.registry,'silence')).toBe(true);expect(spellControl(t,f.game.registry,'itemBlocked')).toBe(true);
 expect(f.game.context.stats(t).moveSpeedPermille).toBe(300);
 run(f,320);expect(spellAppearance(t,f.game.registry)).toEqual({scale:1.2});expect(f.game.context.stats(t).moveSpeedPermille).toBe(1000);
});
it('Avatar changes stats and health through normal operations, then caps health on expiry',()=>{
 const f=fixture('avatar'),c=f.c(),before=f.game.context.stats(c);c.hp=300;
 expect(f.game.abilities.cast(c.id,'preview',c.id)).toBeNull();run(f,20);
 expect(spellAppearance(c,f.game.registry)?.scale).toBe(1.6);expect(f.game.context.stats(c).maxHp).toBe(before.maxHp+300);expect(c.hp).toBe(600);
 expect(f.game.context.stats(c).armor).toBe(before.armor+5);expect(f.game.context.stats(c).damage).toBe(before.damage+20);
 run(f,800);expect(c.hp).toBe(before.maxHp);expect(spellAppearance(c,f.game.registry)).toBeUndefined();expect(f.game.context.stats(c).damage).toBe(before.damage);
});
it('dispel restores Hex immediately and overlapping forms reveal their predecessor',()=>{
 const f=fixture();apply(f,'avatar',f.target);run(f,10);apply(f,'hex',f.target);
 expect(spellAppearance(f.t(),f.game.registry)?.asset).toBe('asset.neutral.tree-frog');
 apply(f,'dispel-magic',f.target);expect(spellAppearance(f.t(),f.game.registry)).toEqual({scale:1.6});
 run(f,800);expect(spellAppearance(f.t(),f.game.registry)).toBeUndefined();
});
it('Hex interrupts pending spells',()=>{
 const f=fixture('avatar');expect(f.game.abilities.cast(f.caster,'preview',f.caster)).toBeNull();
 apply(f,'hex',f.caster);expect(f.c().abilities!.pending).toBeNull();expect(f.game.abilities.cast(f.caster,'preview',f.caster)).toMatch(/unable to cast/i);
});
it('preserves transformed state and restoration across lockstep save/load',()=>{
 const a=fixture(),b=fixture();apply(a,'hex',a.target);run(a,10);b.game.restore(a.game.snapshot());
 for(let i=0;i<330;i++){run(a,1);run(b,1);expect(a.game.checksum()).toBe(b.game.checksum());expect(spellAppearance(a.t(),a.game.registry)).toEqual(spellAppearance(b.t(),b.game.registry));}
});
it('rejects unknown model assets and continuously reapplied passive forms',()=>{
 const a=structuredClone(spell('hex'));a.onRelease[0]={...a.onRelease[0],form:{asset:'asset.missing.form',scale:1}} as typeof a.onRelease[0];
 expect(()=>createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({}))).toThrow(/asset/i);
 const passive={...a,activation:'passive',aura:{radius:2,meleeOnly:false},targeting:{...a.targeting,kind:'self'}};
 expect(abilitySchema.safeParse(passive).success).toBe(false);
});
it('does not clamp away health during the transient removal/rebuild of a health aura',()=>{
 const a=abilitySchema.parse({...spell('true-sight'),id:'ability.test.vitality',onRelease:[{op:'status',id:'vitality',target:'caster',amount:1,polarity:'positive',dispel:false,modifiers:{maxHp:100}}]});
 const f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({}));
 f.game.tick(undefined,{passiveUnits:true});const c=f.game.context.get(f.caster)!;c.hp=600;
 for(let i=0;i<10;i++)f.game.tick(undefined,{passiveUnits:true});expect(c.hp).toBe(600);
 c.abilities!.ranks.preview=0;f.game.tick(undefined,{passiveUnits:true});expect(c.hp).toBe(500);
});

it('selects the same latest form through ties and live ordering changes without sorting the actor statuses',()=>{
 const f=fixture();apply(f,'avatar',f.target);apply(f,'hex',f.target);
 const statuses=f.t().spellStatuses!,original=statuses.slice();
 const expected=()=>statuses.map(s=>({s,form:statusDefinition(f.game.registry.findAbility(s.ability)!,s.status)?.form})).filter(p=>p.form)
  .sort((a,b)=>b.s.started-a.s.started||b.s.cast-a.s.cast||(a.s.ability<b.s.ability?-1:a.s.ability>b.s.ability?1:a.s.status<b.s.status?-1:a.s.status>b.s.status?1:0))[0];
 for(let i=0;i<40;i++){
  statuses[0].started=i%3;statuses[1].started=i%2;statuses[0].cast=i%5;statuses[1].cast=i%4;
  expect(activeSpellFormEntry(f.t(),f.game.registry)).toEqual(expected());
  expect(statuses).toEqual(original); // original objects, same authoritative order
 }
 statuses.reverse();expect(activeSpellFormEntry(f.t(),f.game.registry)).toEqual(expected());
 statuses.length=0;expect(activeSpellFormEntry(f.t(),f.game.registry)).toBeUndefined();
});
