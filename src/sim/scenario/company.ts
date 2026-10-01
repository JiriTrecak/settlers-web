import {campaignCompanySchema,type CampaignCompany} from '../../shared/scenario/company';
import type {Game} from '../game/game';
import type {GameContext} from '../game/context';
import type {Entity} from '../game/state';
import {alive} from '../game/state';
import {validateItemState} from '../game/itemValidation';
/** Travel is a chapter checkpoint: survivors recover, transient combat state expires.
 * Item charges remain spent. No dead companion is recreated by the next map.
 */
export function captureCompany(game:Game):CampaignCompany {
 if(game.state.outcome?.winner!=='player.1')throw new Error('Complete the mission before continuing');
 const tags=game.map.mission?.company;
 if(!tags?.length)throw new Error('This mission has no travelling company');
 return campaignCompanySchema.parse(tags.flatMap(tag=>{
  const e=game.entities.find(e=>e.placement===tag&&e.owner==='player.1'&&e.unit&&alive(e));
  return e?[{tag,definition:e.definition,...(e.progression?{experience:e.progression.experience,...(e.progression.bonuses?{bonuses:{...e.progression.bonuses}}:{})}:{}),
   ...(e.abilities?{learned:{...e.abilities.ranks}}:{}),
   ...(e.equipment?{equipment:[...e.equipment]}:{}),
   ...(e.equipmentState?{equipmentState:e.equipmentState.map(s=>s?{...s,readyTick:0,hits:0}:null)}:{})}]:[];
 }));
}
export function companyForMap(c:GameContext,raw:CampaignCompany):Map<string,CampaignCompany[number]> {
 const members=campaignCompanySchema.parse(raw),tags=c.map.mission?.company;
 if(!tags?.length)throw new Error('The destination does not accept a company');
 for(const m of members){
  const p=c.map.entities.find(p=>p.id===m.tag);
  if(!tags.includes(m.tag)||!p||p.owner!=='player.1'||p.activation||p.definition!==m.definition||!c.registry.get(m.definition).behaviors.playerControl)
   throw new Error('Company member does not match an arrival slot');
 }
 if(!members.some(m=>c.registry.get(m.definition).hero))throw new Error('The company must include its living hero');
 return new Map(members.map(m=>[m.tag,m]));
}
export function restoreCompanyMember(c:GameContext,e:Entity,m:CampaignCompany[number]) {
 const d=c.def(e),levels=d.behaviors.progression?.levels;
 if(m.experience!==undefined){
  const cap=levels?.[Math.min(levels.length,c.map.mission?.heroLevelCap??levels.length)-1]?.experience;
  if(cap===undefined||m.experience>cap)throw new Error('Company experience exceeds the destination level cap');
  e.progression={experience:m.experience,...(m.bonuses?{bonuses:{...m.bonuses}}:{})};
 }
 if(m.bonuses&&!e.progression)throw new Error("Permanent bonuses require a hero progression");
 if(m.equipment){
  if(m.equipment.length!==d.behaviors.inventory?.slots||m.equipment.some(id=>id&&!c.registry.find(id)?.itemEffect))throw new Error('Invalid company inventory');
  e.equipment=[...m.equipment];
 }
 if(m.equipmentState)e.equipmentState=structuredClone(m.equipmentState);
 validateItemState(e,c.registry);
 const stats=c.stats(e);
 if(m.learned){
  if(!e.abilities)throw Error('Company has no ability caster');
  const bindings=d.behaviors.abilities!.bindings;
  if(Object.keys(m.learned).length!==bindings.length)throw Error('Invalid company ability bindings');
  let spent=0;
  for(const b of bindings){const rank=m.learned[b.id];if(rank===undefined||rank<b.initialRank||rank>c.registry.abilityLibrary.abilities.find(a=>a.id===b.ability)!.ranks.length||(!b.learning&&rank!==b.initialRank)||(b.learning&&rank>0&&b.learning.requiredLevels[rank-1]>stats.level))throw Error('Invalid company ability rank');spent+=rank-b.initialRank;}
  if(spent>stats.level)throw Error('Invalid company skill points');
  e.abilities.ranks={...m.learned};
 }
 e.hp=stats.maxHp;
 if(e.abilities)e.abilities.mana=stats.maxMana;
}
