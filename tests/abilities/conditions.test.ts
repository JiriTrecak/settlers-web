import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,releaseEffects} from '../../src/content/abilities/schema';
import {abilityConditionSchema,matchesAbilityCondition,type UnitNature} from '../../src/content/abilities/conditions';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {abilityAimScore} from '../../src/sim/abilities/ai';
import {matchesSpellTarget,unitNature} from '../../src/sim/abilities/eligibility';
import {builtinSource} from '../../src/content/builtin';
import {ContentRegistry} from '../../src/content/registry';
const spell=(id:string)=>coreAbilities.abilities.find(a=>a.id==='ability.core.'+id)!;
function fixture(id:string,settings:Record<string,unknown>={},patch={}){
 const a=abilitySchema.parse({...spell(id),...patch});
 const f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({relationship:'enemy',targetHealth:200,distance:6,...settings}));
 return {...f,a,c:f.game.context.get(f.caster)!,t:f.game.context.get(f.target)!};
}
function classify(f:ReturnType<typeof fixture>,definition:string,nature:UnitNature){
 expect(unitNature(f.game.registry.get(f.c.definition))).toBe(nature);
 for(const e of f.game.entities)if(e.definition===definition)e.definition=f.c.definition;
}
function ticks(f:ReturnType<typeof fixture>,n:number){for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});}
for(const id of ['holy-light','death-coil'])for(const relationship of ['ally','enemy'])for(const nature of ['organic','undead','mechanical'] as UnitNature[]){
 const allowed=nature===(id==='holy-light'?(relationship==='ally'?'organic':'undead'):(relationship==='ally'?'undead':'organic'));
 it(`${id} ${allowed?'affects':'rejects'} ${relationship} ${nature}`,()=>{
  const f=fixture(id,{relationship,targetNature:nature}),mana=f.c.abilities!.mana;
  const reason=f.game.abilities.cast(f.caster,'preview',f.target);
  if(!allowed){expect(reason).toMatch(/filters/);expect(f.c.abilities!.mana).toBe(mana);expect(f.c.abilities!.pending).toBeNull();return;}
  expect(reason).toBeNull();ticks(f,80);expect(f.t.hp).toBe(relationship==='ally'?400:100);
  expect(f.game.abilities.observedEvents().some(e=>e.event===(relationship==='ally'?'healed':'damaged'))).toBe(true);
 });
}
it('rejects full-health healing after resolving the class branch but accepts damage',()=>{
 const heal=fixture('death-coil',{relationship:'ally',targetNature:'undead',targetHealth:500});expect(heal.game.abilities.cast(heal.caster,'preview',heal.target)).toMatch(/full health/);
 const dmg=fixture('holy-light',{targetNature:'undead',targetHealth:500});expect(dmg.game.abilities.cast(dmg.caster,'preview',dmg.target)).toBeNull();
});
it('shares bounded conditions between targeting, branches and AI, including caster traits',()=>{
 const condition=abilityConditionSchema.parse({kind:'all',conditions:[{kind:'matches',of:'caster',filter:{natures:['undead']}},{kind:'matches',of:'target',relations:['enemy'],filter:{natures:['organic'],heroes:false}}]});
 const caster={id:1,x:0,y:0,hp:100,maxHp:500,unit:true,alive:true,targetable:true,nature:'undead' as const};
 const target={...caster,id:2,x:2,nature:'organic' as const};
 const relation=(t:{id:number})=>t.id===1?'ally' as const:'enemy' as const;
 const a=abilitySchema.parse({...spell('death-coil'),targeting:{...spell('death-coil').targeting,condition},onRelease:[{op:'branch',condition,then:[{op:'damage',target:'target',amount:60,damageType:'spell'}],else:[{op:'heal',target:'target',amount:60}]}]});
 expect(matchesSpellTarget(target,a,caster,'enemy')).toBe(true);expect(matchesSpellTarget({...target,nature:'mechanical'},a,caster,'enemy')).toBe(false);
 expect(releaseEffects(a,1,'enemy',{caster,target})[0].op).toBe('damage');expect(abilityAimScore(a,1,caster,target,[caster,target],relation,'enemy')).toBe(120);
 expect(matchesAbilityCondition(condition,{caster:{nature:'organic'},target,relation:'enemy'})).toBe(false);
 expect(abilityConditionSchema.safeParse({kind:'all',conditions:[]}).success).toBe(false);
 expect(abilityConditionSchema.safeParse({kind:'all',conditions:Array(9).fill({kind:'relation',of:'target',to:'caster',is:'ally'})}).success).toBe(false);
 expect(abilityConditionSchema.safeParse({kind:'all',conditions:[condition]}).success).toBe(false);
});
it('evaluates each queried recipient independently instead of inheriting the aim classification',()=>{
 const condition={kind:'matches',of:'target',filter:{natures:['undead']}};
 const q={center:'target',radius:8,relations:['enemy'],maxTargets:8};
 const f=fixture('holy-light-lite',{targetCount:3,targetNature:'organic',casterNature:'undead'},{onRelease:[{op:'branch',condition,then:[{op:'damage',target:'target',amount:60,damageType:'spell',query:q}],else:[{op:'heal',target:'target',amount:60,query:q}]}]});
 const other=f.game.entities.find(e=>e.id!==f.caster&&e.id!==f.target)!;
 classify(f,other.definition,'undead');
 expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();ticks(f,30);expect(f.t.hp).toBe(260);expect(other.hp).toBe(140);
});
it('class filters constrain default area recipients and independent operation queries',()=>{
 const f=fixture('holy-light-lite',{targetCount:3,targetNature:'organic',casterNature:'undead'},{targeting:{...spell('holy-light-lite').targeting,kind:'point',radius:8,filter:{natures:['undead']}},onRelease:[{op:'damage',target:'target',amount:60,damageType:'spell'},{op:'heal',target:'target',amount:20,filter:{natures:['organic']},query:{center:'target',radius:8,relations:['enemy'],maxTargets:8}}]});
 const other=f.game.entities.find(e=>e.id!==f.caster&&e.id!==f.target)!;classify(f,other.definition,'undead');
 expect(f.game.abilities.cast(f.caster,'preview',{x:f.t.x,y:f.t.y})).toBeNull();ticks(f,30);expect(f.t.hp).toBe(220);expect(other.hp).toBe(140);
});
it('revalidates a newly invalid class at release and at projectile impact',()=>{
 const f=fixture('holy-light',{targetNature:'undead',casterNature:'mechanical'}),mana=f.c.abilities!.mana;expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();
 // Switch to a pre-authored fixture definition to exercise revalidation without mutating immutable content.
 classify(f,f.t.definition,'mechanical');ticks(f,30);expect(f.t.hp).toBe(200);expect(f.c.abilities!.mana).toBe(mana);
 const g=fixture('death-coil',{distance:12,casterNature:'mechanical'});expect(g.game.abilities.cast(g.caster,'preview',g.target)).toBeNull();
 while(!g.game.state.spellDeliveries.length&&g.game.state.tick<60)ticks(g,1);
 expect(g.game.state.spellDeliveries).toHaveLength(1);classify(g,g.t.definition,'mechanical');ticks(g,80);expect(g.t.hp).toBe(200);expect(g.game.state.spellDeliveries).toHaveLength(0);
});
it('restores a conditional projectile without changing its outcome or model',()=>{
 const f=fixture('death-coil',{targetNature:'undead',relationship:'ally',distance:12});expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();ticks(f,13);
 expect(f.game.state.spellDeliveries.length).toBeGreaterThan(0);
 const restored=fixture('death-coil',{targetNature:'undead',relationship:'ally',distance:12});restored.game.restore(f.game.snapshot());
 for(let i=0;i<80;i++){ticks(f,1);ticks(restored,1);expect(restored.game.checksum()).toBe(f.game.checksum());}
 expect(f.t.hp).toBe(400);expect(f.models.get(f.t.definition)).toBe(encounterSettingsSchema.parse({}).targetDefinition);
 expect(unitNature({kind:'unit'})).toBe('organic');expect(unitNature({kind:'building'})).toBeUndefined();
});

it('rejects unit nature on buildings and includes classification in the content fingerprint',()=>{
 const source=structuredClone(builtinSource),unit=source.definitions.find((d:any)=>d.kind==='unit') as any;
 const original=new ContentRegistry(source).fingerprint;unit.unitNature='undead';expect(new ContentRegistry(source).fingerprint).not.toBe(original);
 const building=source.definitions.find((d:any)=>d.kind==='building') as any;building.unitNature='mechanical';expect(()=>new ContentRegistry(source)).toThrow(/unit nature requires a unit/);
});
