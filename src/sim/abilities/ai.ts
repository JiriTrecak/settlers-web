import {swarmEligible} from './swarm';
import {selectCorpses,type CorpseView} from './corpses';
import {effectMagnitude,recordEffect,type EffectResults} from './magnitudes';
import {statusHasPayload} from './controlPolicy';
import {matchesAbilityCondition} from '../../content/abilities/conditions';
import {acceptsSpell} from './eligibility';
import {value,type AbilityDefinition,type Effect,type Relation} from '../../content/abilities/schema';
import {operationTargets,type Recipient,type RecipientPoint} from './recipients';
/** Score the same operation recipients as execution, using observed information only. */
export function abilityAimScore<T extends Recipient>(ability:AbilityDefinition,rank:number,caster:T,aim:RecipientPoint,observed:readonly T[],relation:(target:T)=>Relation,preference:'wounded-ally'|'enemy',hasStatus:(id:number)=>boolean=()=>false,corpses:readonly CorpseView[]=[]):number{
 if(ability.delivery?.kind==='swarm'){
  // Score the impact program without crediting cargo as an immediate caster restore.
  // Return healing occurs on a separate trip and cannot change branches during this bite.
  const impactOnly=(effect:Effect):Effect=>effect.op==='drain'?{...effect,restoreCaster:false}:effect;
  const d=ability.delivery,copy={...ability,delivery:undefined,targeting:{...ability.targeting,kind:'unit' as const,radius:undefined},onRelease:ability.onRelease.map(op=>op.op==='branch'?{...op,then:op.then.map(impactOnly),else:op.else.map(impactOnly)}:impactOnly(op))};
  return observed.filter(t=>swarmEligible(t,caster,ability,d,relation(t))).sort((a,b)=>a.id-b.id).slice(0,value(d.count,ability.ranks[rank-1])).reduce((score,t)=>score+abilityAimScore(copy,rank,caster,t,observed,relation,preference,hasStatus,corpses),0);
 }
 if(ability.weaponCast){const target=observed.find(e=>e.id===aim.id);return target&&relation(target)==='enemy'&&acceptsSpell(target,ability,'enemy')?Math.min(target.hp,value(ability.weaponCast.bonus,ability.ranks[rank-1]))+(ability.weaponCast.status&&!hasStatus(target.id)?10:0):0;}
 const actors=new Map(observed.map(a=>[a.id,{...a}]));if(!actors.has(caster.id))actors.set(caster.id,{...caster});
 const defaultCandidates=[...actors.values()].map(a=>({...a}));
 const relationships=new Map<number,Relation>();
 const predictedRelation=(target:T):Relation=>relationships.get(target.id)??relation(target);
 const results:EffectResults=new Map(),primary=actors.get(aim.id),resources={caster:{...caster},target:primary?{...primary}:undefined};
 const parameters=ability.ranks[rank-1];let score=0;
 const threats=observed.some(t=>relation(t)==='enemy'&&(t.x-caster.x)**2+(t.y-caster.y)**2<=24**2);
 for(const operation of ability.onRelease){
  const decisions=new Map<number,boolean>(),branchCaster={...(actors.get(caster.id)??caster)};
  for(const effect of operation.op==='branch'?[...operation.then,...operation.else]:[operation]){
   const operationCaster={...(actors.get(caster.id)??caster)},operationAim=effect.op==='teleport'&&effect.destination==='target'?{...(actors.get(aim.id)??aim)}:aim;
   for(const target of operationTargets(effect,ability,rank,effect.query||effect.target==='caster'?operationCaster:caster,aim,effect.query?[...actors.values()]:defaultCandidates,effect.query?predictedRelation:relation)){
    const actor=actors.get(target.id),team=actor?predictedRelation(actor):'ally';
    if(operation.op==='branch'){
     if(!decisions.has(target.id))decisions.set(target.id,matchesAbilityCondition(operation.condition,{relation:team,caster:branchCaster,target:actor??{}}));
     if(!(decisions.get(target.id)?operation.then:operation.else).includes(effect))continue;
    }
    if(team==='neutral'||actor&&(!actor.alive||!acceptsSpell(actor,ability,team)))continue;
    const before=actor?{...actor}:undefined,amount=effectMagnitude(effect,parameters,{...resources,recipient:actor,results}),friendly=team==='ally';let benefit=0;
    switch(effect.op){
     case 'heal': benefit=actor?Math.min(amount,actor.maxHp-actor.hp)*(friendly?1:-1):0;break;
     case 'damage': benefit=actor?Math.min(amount*(actor.damageTakenPermille?.[effect.damageType]??1000)/1000,actor.hp)*(friendly?-1:1):0;break;
     case 'drain': benefit=actor?(effect.resource==='health'?Math.min(amount,actor.hp):Math.min(amount,actor.mana??actor.maxMana??0))*(friendly?-1:1):0;break;
     case 'mana': benefit=actor?Math.min(amount,Math.max(0,(actor.maxMana??0)-(actor.mana??actor.maxMana??0)))*(friendly?1:-1):0;break;
     case 'status': benefit=hasStatus(target.id)||actor?.controlImmunity?.length&&!statusHasPayload(effect,ability,rank,new Set(actor.controlImmunity))?0:((effect.polarity==='positive')===friendly?10:-10);if(friendly&&ability.targeting.kind==='self'&&!threats)benefit=0;break;
     case 'summon': {
      const existing=effect.replace?0:observed.filter(t=>t.alive&&t.owner===caster.owner&&t.summonOrigin?.source===caster.id&&t.summonOrigin.ability===ability.id).length;
      const capacity=effect.maxActive===undefined?Infinity:Math.max(0,value(effect.maxActive,parameters)-existing);
      const requested=amount*(effect.corpses?Math.min(value(effect.corpses.maxTargets,parameters),selectCorpses(corpses,{corpses:effect.corpses},parameters,target,c=>c.relation??'neutral').length):1);
      benefit=threats?Math.min(requested,capacity)*20:0;break;
     }
     case 'split': benefit=threats?effect.members.length*20:0;break;
     case 'resurrect': benefit=effect.durationTicks!==undefined&&!threats?0:selectCorpses(corpses,effect,parameters,target,c=>c.relation??'neutral').slice(0,amount).reduce((sum,c)=>sum+c.maxHp*value(effect.healthPermille,parameters)/1000*(effect.ownership==='caster'||c.relation==='ally'?1:-1),0);break;
     case 'contain': benefit=actor?.unit&&!actor.hero&&!friendly?actor.hp:0;break;
     case 'releaseContained': benefit=0;break;
     case 'convert': benefit=actor?.unit&&!actor.hero&&!friendly?actor.hp+actor.maxHp:0;break;
     case 'sacrifice':
      if(!caster.owner||!friendly||!actor?.unit||actor.hero||actor.id===caster.id||actor.owner!==caster.owner)continue;
      benefit=-actor.hp;break;
     case 'teleport': benefit=0;break; // Movement decisions require a tactical destination, not an arbitrary victim.
     case 'vision': benefit=0;break; // Scouting destinations belong to strategic AI.
     case 'dispel': benefit=effect.polarity==='all'||(effect.polarity==='negative')===friendly?10:0;break;
    }
    const applied=effect.op==='sacrifice'?1:effect.op==='convert'?Number(benefit>0):Math.abs(benefit);
    recordEffect(results,effect,before,applied);
    // Predict resource sequencing on local observed copies, never on authoritative entities.
    if(actor){
     if(effect.op==='sacrifice'){actor.hp=0;actor.alive=false;}
     else if(effect.op==='convert'&&applied&&caster.owner){actor.owner=caster.owner;relationships.set(actor.id,'ally');}
     else if(effect.op==='heal')actor.hp=Math.min(actor.maxHp,actor.hp+applied);
     else if(effect.op==='damage'||effect.op==='drain'&&effect.resource==='health'){actor.hp=Math.max(0,actor.hp-applied);actor.alive=actor.hp>0;}
     else if(effect.op==='mana')actor.mana=Math.min(actor.maxMana??0,(actor.mana??0)+applied);
     else if(effect.op==='drain'&&effect.resource==='mana'&&actor.mana!==undefined)actor.mana=Math.max(0,actor.mana-applied);
     else if(effect.op==='teleport'){
      // Predict the authored destination from observations only. Actual landing
      // clearance stays authoritative; this is a tactical scoring estimate.
      const destination=effect.destination==='caster'?operationCaster:operationAim;
      const dx=effect.preserveOffset?actor.x-operationCaster.x:0,dy=effect.preserveOffset?actor.y-operationCaster.y:0;
      actor.x=Math.round(destination.x+dx);actor.y=Math.round(destination.y+dy);
     }
     else if(effect.op==='status'&&effect.form?.movement&&benefit!==0)actor.locomotion=effect.form.movement.locomotion;
    }
    if(effect.op==='drain'){
     const recipientCaster=actors.get(caster.id);
     if(effect.restoreCaster&&recipientCaster?.alive&&recipientCaster.owner===caster.owner){
      const restored=effect.resource==='health'?Math.min(applied,Math.max(0,recipientCaster.maxHp-recipientCaster.hp)):
       recipientCaster.mana!==undefined&&recipientCaster.maxMana!==undefined?Math.min(applied,Math.max(0,recipientCaster.maxMana-recipientCaster.mana)):0;
      if(effect.resource==='health')recipientCaster.hp+=restored;
      else if(recipientCaster.mana!==undefined)recipientCaster.mana+=restored;
      // The transfer benefits the caster independently of the target's relationship.
      score+=restored*(preference==='wounded-ally'?2:1);
     }
     if(actor&&effect.resource==='mana'&&effect.damagePerDrainedPermille){
      const burned=Math.min(actor.hp,Math.floor(applied*effect.damagePerDrainedPermille/1000)*(actor.damageTakenPermille?.[effect.damageType]??1000)/1000);
      actor.hp-=burned;actor.alive=actor.hp>0;benefit+=burned*(friendly?-1:1);
     }
    }
    score+=benefit*(team===(preference==='wounded-ally'?'ally':'enemy')?2:1);
   }
  }
 }
 return score;
}
export {value};

type StrategicIntent='escape'|'reinforce'|'scout';
/** Bounded tactical samples. No access to hidden entities or authoritative pathfinding. */
export function strategicAbilityAims<T extends Recipient>(intent:StrategicIntent,ability:AbilityDefinition,rank:number,caster:T,observed:readonly T[],relation:(target:T)=>Relation,knowledge:{valid:(p:{x:number;y:number})=>boolean;visible:(p:{x:number;y:number})=>boolean;explored:(p:{x:number;y:number})=>boolean}):(number|{x:number;y:number})[]{
 const range=value(ability.targeting.range,ability.ranks[rank-1]),enemies=observed.filter(t=>t.alive&&relation(t)==='enemy');
 const distance=(a:{x:number;y:number},b:{x:number;y:number})=>(a.x-b.x)**2+(a.y-b.y)**2;
 if(intent==='reinforce')return observed.filter(t=>t.alive&&t.targetable&&(t.unit||ability.targeting.includeBuildings)&&relation(t)==='ally'&&t.id!==caster.id&&distance(t,caster)>12**2&&distance(t,caster)<=range**2).map(t=>({id:t.id,threat:enemies.filter(e=>distance(e,t)<=8**2).length})).filter(t=>t.threat>0).sort((a,b)=>b.threat-a.threat||a.id-b.id).map(t=>t.id);
 if(intent==='escape'&&(caster.hp>caster.maxHp*.5||!enemies.some(e=>distance(e,caster)<=10**2)))return [];
 const points:{x:number;y:number;score:number;index:number}[]=[];
 for(let ring=1;ring<=2;ring++)for(let i=0;i<16;i++){
  const theta=(i+caster.id%16)/16*Math.PI*2,radius=Math.min(range,intent==='escape'?16:128)*ring/2;
  const p={x:Math.round(caster.x+Math.cos(theta)*radius),y:Math.round(caster.y+Math.sin(theta)*radius)};
  if(distance(p,caster)>range**2||!knowledge.valid(p)||ability.targeting.visible&&!knowledge.visible(p))continue;
  const safety=Math.min(...enemies.map(e=>distance(e,p)));
  if(intent==='escape'&&safety<=Math.min(...enemies.map(e=>distance(e,caster))))continue;
  if(intent==='scout'&&knowledge.visible(p))continue;
  points.push({...p,score:intent==='escape'?safety:(knowledge.explored(p)?0:10000)+distance(p,caster),index:points.length});
 }
 return points.sort((a,b)=>b.score-a.score||a.index-b.index).map(({x,y})=>({x,y}));
}

/** Corpse-centered point samples complement living-target samples for resurrection areas. */
export function corpseAbilityAims(ability:AbilityDefinition,corpses:readonly CorpseView[]):RecipientPoint[]{
 if(ability.targeting.kind!=='point'||!ability.onRelease.flatMap(o=>o.op==='branch'?[...o.then,...o.else]:[o]).some(o=>(o.op==='resurrect'||o.op==='summon'&&o.corpses)&&o.target==='point'))return [];
 return [...corpses].sort((a,b)=>a.id-b.id).map(c=>({id:c.id,x:Math.round(c.x),y:Math.round(c.y)}));
}
