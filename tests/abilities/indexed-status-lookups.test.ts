import {expect,it} from 'vitest';
import {abilityLibrarySchema,allEffects,statusDefinition} from '../../src/content/abilities/schema';
import type {ContentRegistry} from '../../src/content/registry';
import {spellImmunity} from '../../src/sim/abilities/eligibility';
import {combatModifiers,markedWeaponBonus} from '../../src/sim/abilities/combatModifiers';
import type {SpellStatus} from '../../src/sim/abilities/state';
import {game,placed} from '../game/helpers';

it('retains immunity and weapon modifiers across status ranks, expiry and live replacement',()=>{
 const g=game([placed('actor','unit.ants.warrior'),placed('source','unit.ants.warrior',210,210)],draft=>{
  const library=abilityLibrarySchema.parse(draft.abilityLibrary);
  const status=library.abilities.flatMap(allEffects).find(e=>e.op==='status'&&!e.spellImmunity);
  if(status?.op!=='status')throw Error('Fixture needs an ordinary status');
  status.spellImmunity='all';
  draft.abilityLibrary=library;
 });
 const registry=g.registry,actor=g.entities.find(e=>e.placement==='actor')!,source=g.entities.find(e=>e.placement==='source')!;
 // Independent pre-index lookup policy. All declaration resolution uses full
 // catalogue and nested effect scans, not either production registry index.
 const linear=Object.create(registry) as ContentRegistry;
 Object.defineProperties(linear,{
  findAbility:{value:(id:string)=>registry.abilityLibrary.abilities.find(a=>a.id===id)},
  findStatus:{value:(id:string,status:string)=>{const a=registry.abilityLibrary.abilities.find(a=>a.id===id);return a&&statusDefinition(a,status);}},
 });
 const statuses:SpellStatus[]=[];
 for(const a of registry.abilityLibrary.abilities)for(const d of allEffects(a))if(d.op==='status')
  for(let rank=1;rank<=a.ranks.length;rank++)statuses.push({ability:a.id,status:d.id,rank,owner:source.owner,source:source.id,cast:1,started:0,expires:10,nextTick:1,aura:false});
 statuses.push({...statuses[0]!,ability:'missing'},{...statuses[0]!,status:'missing'});
 const immunities=new Set<string>();
 const verify=()=>{
  for(const tick of [undefined,9,10,11]){
   let expected:'hostile'|'all'|undefined;
   for(const s of actor.spellStatuses??[]){
    if(tick!==undefined&&s.expires<=tick)continue;
    const d=linear.findStatus(s.ability,s.status);
    if(d?.spellImmunity==='all'){expected='all';break;}
    if(d?.spellImmunity)expected=d.spellImmunity;
   }
   expect(spellImmunity(actor,registry,tick)).toBe(expected);
   if(expected)immunities.add(expected);
   if(tick!==undefined){
    expect(combatModifiers(actor,registry,tick)).toEqual(combatModifiers(actor,linear,tick));
    expect(markedWeaponBonus(source,actor,registry,tick)).toBe(markedWeaponBonus(source,actor,linear,tick));
   }
  }
 };
 verify();
 for(let i=0;i<statuses.length;i++){
  actor.spellStatuses=[statuses[i]!,statuses[(i+7)%statuses.length]!,statuses[(i+19)%statuses.length]!];verify();
  actor.spellStatuses.push(statuses[i]!);verify();
  actor.spellStatuses.splice(0,2);verify();
 }
 actor.spellStatuses=[];verify();
 expect(immunities).toEqual(new Set(['hostile','all']));
});
