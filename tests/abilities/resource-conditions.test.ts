import {expect,it} from 'vitest';
import {abilityConditionSchema,matchesAbilityCondition} from '../../src/content/abilities/conditions';
import {abilitySchema,type Effect} from '../../src/content/abilities/schema';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {abilityAimScore} from '../../src/sim/abilities/ai';
import {matchesSpellTarget} from '../../src/sim/abilities/eligibility';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import type {PreviewState} from '../../tooling/spell-editor/shared/view';
const injured={kind:'resource',of:'target',resource:'health',measure:'missing',comparison:'gt',value:0} as const;
const ward:Effect={op:'status',target:'target',id:'ward',amount:120,polarity:'positive',dispel:true,modifiers:{armor:2},lifetime:'duration'};
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.holy-light-lite')!,presentation=coreAbilities.presentations.find(p=>p.id===base.presentation)!;
function definition(patch={}){return abilitySchema.parse({...base,targeting:{...base.targeting,relations:['ally'],condition:injured},onRelease:[{op:'heal',target:'target',amount:100},ward],...patch});}
function fixture(patch={},settings={}){const a=definition(patch),f=createAbilityEncounter(a,presentation,encounterSettingsSchema.parse({relationship:'ally',targetHealth:450,distance:6,...settings}));return {...f,a,c:f.game.context.get(f.caster)!,t:f.game.context.get(f.target)!};}
const step=(f:ReturnType<typeof fixture>,n:number)=>{for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});};
it('evaluates exact current/missing/fraction thresholds, groups and unknown observations',()=>{
 const context={relation:'ally',caster:{hp:100,maxHp:500,mana:20,maxMana:100},target:{hp:1,maxHp:3}};
 expect(matchesAbilityCondition(injured,context)).toBe(true);
 expect(matchesAbilityCondition({...injured,measure:'fractionPermille',value:333},context)).toBe(true);
 expect(matchesAbilityCondition({...injured,measure:'fractionPermille',comparison:'lte',value:333},context)).toBe(false);
 expect(matchesAbilityCondition({...injured,resource:'mana'},context)).toBe(false);
 expect(matchesAbilityCondition({...injured,resource:'mana',of:'caster',measure:'current',comparison:'eq',value:20},context)).toBe(true);
 expect(matchesAbilityCondition({...injured,measure:'fractionPermille'}, {...context,target:{hp:0,maxHp:0}})).toBe(false);
 expect(matchesAbilityCondition({kind:'all',conditions:[injured,{...injured,of:'caster',resource:'mana',value:79}]},context)).toBe(true);
 expect(abilityConditionSchema.safeParse({...injured,value:-1}).success).toBe(false);expect(abilityConditionSchema.safeParse({...injured,script:'anything'}).success).toBe(false);
});
it('rejects full-health compound targets before spending mana and revalidates wounds at release',()=>{
 const f=fixture({}, {targetHealth:500}),mana=f.c.abilities!.mana;
 expect(f.game.abilities.cast(f.caster,'preview',f.target)).toMatch(/filters/);expect(f.c.abilities!.mana).toBe(mana);
 f.t.hp=450;expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();f.t.hp=500;step(f,40);
 expect(f.c.abilities!.mana).toBe(mana);expect(f.t.spellStatuses).toBeUndefined();expect(f.game.abilities.observedEvents().some(e=>e.event==='healed')).toBe(false);
});
it('applies the whole heal-and-ward payload even when healing fills the recipient',()=>{
 const f=fixture(),armor=f.game.context.stats(f.t).armor;expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();step(f,40);
 expect(f.t.hp).toBe(500);expect(f.game.context.stats(f.t).armor).toBe(armor+2);expect(f.t.spellStatuses?.[0].expires! - f.t.spellStatuses?.[0].started!).toBe(120);
});
it('revalidates an in-flight projectile after another effect fills its target and survives save/restore',()=>{
 const patch={delivery:{kind:'projectile',speed:8}},f=fixture(patch);f.game.abilities.cast(f.caster,'preview',f.target);
 for(let i=0;i<40&&!f.game.state.spellDeliveries.length;i++)step(f,1);
 expect(f.game.state.spellDeliveries.length).toBe(1);f.t.hp=500;const other=fixture(patch);other.game.restore(JSON.parse(JSON.stringify(f.game.snapshot())));
 for(let i=0;i<80;i++){step(f,1);step(other,1);expect(other.game.checksum()).toBe(f.game.checksum());}
 expect(f.t.spellStatuses).toBeUndefined();expect(f.game.abilities.observedEvents().some(e=>e.event==='healed')).toBe(false);
});
it('keeps a branch choice after its own heal, in simulation and observed AI prediction',()=>{
 const a=definition({targeting:{...base.targeting,relations:['ally']},onRelease:[{op:'branch',condition:injured,then:[{op:'heal',target:'target',amount:100},ward],else:[{op:'damage',target:'target',amount:20,damageType:'spell'}]}]}),f=fixture(a);
 f.game.abilities.cast(f.caster,'preview',f.target);step(f,40);expect(f.t.hp).toBe(500);expect(f.t.spellStatuses?.[0].status).toBe('ward');
 const caster={id:1,x:0,y:0,hp:500,maxHp:500,unit:true,alive:true,targetable:true},target={...caster,id:2,x:3,hp:450};
 expect(abilityAimScore(a,1,caster,target,[caster,target],()=>'ally','wounded-ally')).toBe(120);expect(target.hp).toBe(450);
});
it('admits wounded default-area recipients once for a compound payload',()=>{
 const f=fixture({targeting:{...base.targeting,kind:'point',relations:['ally'],condition:injured,radius:5,allowSelf:false}}, {targetCount:3,targetSpacing:2});
 expect(f.game.abilities.cast(f.caster,'preview',{x:126,y:120})).toBeNull();step(f,40);
 for(const e of f.game.entities.filter(e=>e.id!==f.caster)){expect(e.hp).toBe(500);expect(e.spellStatuses?.[0].status).toBe('ward');}
});
it('exposes resource eligibility in the editor and reproduces the wound-gated preview on rewind',async()=>{
 const service=new SpellEditorService('/tmp'),p=structuredClone(presentation);delete p.icon;p.effects=[];
 await service.execute({op:'preview.load',document:{definition:definition(),presentation:p},settings:{relationship:'ally',targetHealth:450}});
 const state=()=>service.state() as PreviewState,subject=()=>state().entities.find(e=>e.id===state().target)!;
 expect(matchesSpellTarget(subject().eligibility!,definition(),state().entities[0].eligibility!,'ally')).toBe(true);
 await service.execute({op:'preview.cast'});await service.execute({op:'preview.seek',tick:40});const checksum=state().checksum;expect(subject().hp).toBe(500);
 expect(matchesSpellTarget(subject().eligibility!,definition(),state().entities[0].eligibility!,'ally')).toBe(false);
 await service.execute({op:'preview.seek',tick:1});await service.execute({op:'preview.seek',tick:40});expect(state().checksum).toBe(checksum);
});
