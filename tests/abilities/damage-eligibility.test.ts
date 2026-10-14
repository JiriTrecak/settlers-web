import {expect,it} from 'vitest';
import {builtinSource} from '../../src/content/builtin';
import {ContentRegistry} from '../../src/content/registry';
import {allEffects,statusDefinition,value} from '../../src/content/abilities/schema';
import {damageEligibility,isEthereal,spellDamageMultiplier} from '../../src/sim/abilities/damagePolicy';
import type {SpellStatus} from '../../src/sim/abilities/state';

it('matches complete declaration scans across status combinations, ranks and live changes',()=>{
 const r=new ContentRegistry(builtinSource),types=Object.keys(r.rules.damageTypes);
 const records:SpellStatus[]=[];
 for(const a of r.abilityLibrary.abilities)for(const d of allEffects(a))if(d.op==='status')
  for(let rank=1;rank<=a.ranks.length;rank++)records.push({ability:a.id,status:d.id,rank,owner:'player.1',source:1,cast:1,started:0,expires:1,nextTick:1,aura:false});
 records.push({...records[0]!,ability:'missing'}, {...records[0]!,status:'missing'});
 expect(records.length).toBeGreaterThan(30);
 const subject:{spellStatuses:SpellStatus[]}={spellStatuses:[]};
 const verify=()=>{
  // Independent oracle: the original complete library/declaration scan, rather
  // than the registry indexes or production multiplier helper.
  const entries=subject.spellStatuses.flatMap(s=>{
   const a=r.abilityLibrary.abilities.find(a=>a.id===s.ability),d=a&&statusDefinition(a,s.status);
   return a&&d?[{d,rank:a.ranks[s.rank-1]}]:[];
  });
  const multipliers=Object.fromEntries(types.map(type=>{
   if(entries.some(({d})=>d.immunity===(type==='spell'?'spell':'physical')||type!=='spell'&&d.ethereal))return [type,0];
   const factors=entries.flatMap(({d,rank})=>d.damageTakenPermille?.[type]===undefined?[]:[value(d.damageTakenPermille[type],rank)]);
   return [type,Math.min(1000,...factors)*Math.max(1000,...factors)/1000];
  }));
  expect(damageEligibility(subject,r)).toEqual({ethereal:entries.some(({d})=>d.ethereal),damageTakenPermille:multipliers});
  expect(isEthereal(subject,r)).toBe(entries.some(({d})=>d.ethereal));
  for(const type of types)expect(spellDamageMultiplier(subject,r,type)).toBe(multipliers[type]);
 };
 verify();
 for(let i=0;i<records.length;i++){
  subject.spellStatuses=[records[i]!,records[(i+7)%records.length]!,records[(i+19)%records.length]!];
  verify();
  const previous=damageEligibility(subject,r),saved=structuredClone(previous);
  subject.spellStatuses.push(records[i]!);verify(); // Duplicate sources do not multiply strength.
  subject.spellStatuses.splice(0,2);verify();
  expect(previous).toEqual(saved); // Returned snapshots never share mutable scratch state.
 }
 subject.spellStatuses=[];verify();
});
