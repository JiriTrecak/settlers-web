import {expect,it} from 'vitest';
import {abilitySchema} from '../../src/content/abilities/schema';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilityAimScore} from '../../src/sim/abilities/ai';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.holy-light-lite')!;
const presentation=coreAbilities.presentations.find(p=>p.id===base.presentation)!;
const caster={id:1,x:120,y:120,owner:'player.1',hp:400,maxHp:500,mana:50,maxMana:100,alive:true,targetable:true,unit:true};
const target={...caster,id:2,x:123,owner:'player.2',hp:200,mana:80};
const damage=(amount:number)=>({op:'damage',target:'target',amount,damageType:'spell'});
const branch=(resource:'health'|'mana',value:number)=>({op:'branch',condition:{kind:'resource',of:'caster',resource,measure:'current',comparison:'gte',value},then:[damage(70)],else:[damage(0)]});
function definition(operations:unknown[]){return abilitySchema.parse({...base,cast:{...base.cast,cost:{...base.cast.cost,amount:0}},onRelease:operations});}
function score(operations:unknown[],c=caster,t=target){const before=structuredClone([c,t]);const value=abilityAimScore(definition(operations),1,c,t,[c,t],a=>a.owner===c.owner?'ally':'enemy','enemy');expect([c,t]).toEqual(before);return value;}

it('predicts health restoration before the next branch just as the real release program does',()=>{
 const operations=[{op:'drain',target:'target',amount:50,resource:'health',restoreCaster:true,damageType:'spell'},branch('health',450)];
 const ability=definition(operations),f=createAbilityEncounter(ability,presentation,encounterSettingsSchema.parse({relationship:'enemy',distance:3,casterHealth:400,targetHealth:200,mana:1000}));
 expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();for(let i=0;i<30;i++)f.game.tick(undefined,{passiveUnits:true});
 expect(f.game.context.get(f.caster)!.hp).toBe(450);expect(f.game.context.get(f.target)!.hp).toBe(80);
 expect(score(operations)).toBe(290);
});
it('caps restored mana and uses it for subsequent caster conditions',()=>{
 const operations=[{op:'drain',target:'target',amount:80,resource:'mana',restoreCaster:true,damageType:'spell'},branch('mana',100)];
 expect(score(operations)).toBe(350); // 80 drained × 2, 50 restored, 70 damage × 2.
 expect(score([operations[0],branch('mana',101)])).toBe(210);
});
it('scores enemy mana restoration as a cost and records the real restored amount for composition',()=>{
 const operations=[{op:'mana',target:'target',amount:100,record:'gift'},
  {op:'damage',target:'target',amount:0,damageType:'spell',scale:{source:'result',id:'gift',stat:'applied',permille:1000}}];
 expect(score(operations)).toBe(0); // 20 enemy mana restored, followed by 20 damage.
 expect(score([operations[0]])).toBe(-40);
});
it('predicts mana-burn damage before a following target-health branch',()=>{
 const operations=[{op:'drain',target:'target',amount:80,resource:'mana',restoreCaster:false,damagePerDrainedPermille:1000,damageType:'spell'},
  {op:'branch',condition:{kind:'resource',of:'target',resource:'health',measure:'current',comparison:'lte',value:120},then:[damage(70)],else:[damage(0)]}];
 expect(score(operations)).toBe(460); // 80 mana + 80 burn + 70 follow-up, enemy weighted.
});
it('does not use returning-swarm cargo to change a branch before the seeker returns',()=>{
 const swarm=coreAbilities.abilities.find(a=>a.id==='ability.core.spirit-swarm')!;
 const ability=abilitySchema.parse({...swarm,onRelease:[{op:'drain',target:'target',amount:50,resource:'health',restoreCaster:true,damageType:'spell'},branch('health',450)]});
 expect(abilityAimScore(ability,1,caster,caster,[caster,target],a=>a.owner===caster.owner?'ally':'enemy','enemy')).toBe(100);
});
