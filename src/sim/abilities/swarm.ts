import {value,type AbilityDefinition,type Relation} from '../../content/abilities/schema';
import {acceptsSpell,matchesSpellFilter} from './eligibility';
import type {Recipient} from './recipients';
import type {AbilityActor,AbilityHost} from './runtime';
import type {SpellDelivery} from './state';
export type SwarmPolicy=Extract<NonNullable<AbilityDefinition['delivery']>,{kind:'swarm'}>;
export type SwarmCargo={health:number;mana:number};
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>(a.x-b.x)**2+(a.y-b.y)**2;
/** Shared selection predicate; AI passes only observed actors. */
export function swarmEligible<T extends Recipient>(t:T,caster:T,spell:AbilityDefinition,d:SwarmPolicy,relation:Relation){
 return t.id!==caster.id&&t.alive&&t.targetable&&(t.unit||d.includeBuildings)&&relation==='enemy'&&distance(t,caster)<=d.radius**2&&matchesSpellFilter(t,d.filter)&&acceptsSpell(t,spell,relation);
}
/** Saved seekers are deliveries, not simulation units: no supply, orders, collision or pathfinding. */
export function stepSwarm(host:AbilityHost,shot:SpellDelivery,queue:readonly SpellDelivery[],caster:AbilityActor,spell:AbilityDefinition,d:SwarmPolicy,impact:(target:AbilityActor,cargo:SwarmCargo)=>void,returned:(cargo:SwarmCargo)=>void,launched:()=>void):boolean{
 const s=shot.swarm,now=host.tick();
 if(!s||!caster.alive||!caster.targetable||caster.owner!==shot.owner||caster.camp!==shot.sourceContext?.camp||now>=s.expires+d.returnTimeoutTicks)return true;
 if(s.phase==='waiting'){
  shot.position={x:caster.x,y:caster.y,height:caster.height??host.height?.(caster)??0};shot.point={...shot.position};
  if(now<s.launchTick)return false;s.phase='seeking';launched();
 }
 if(now>=s.expires){s.phase='returning';shot.target=0;}
 const eligible=(t:AbilityActor|undefined):t is AbilityActor=>!!t&&swarmEligible(t,caster,spell,d,host.relation(caster,t))&&host.visible(caster.owner,t,caster);
 if(s.phase==='seeking'){
  if(!shot.target&&now<shot.nextTick)return false;
  if(!eligible(host.get(shot.target))){
   shot.target=0;
   const assigned=new Map<number,number>();for(const other of queue)if(other!==shot&&other.swarm?.group===s.group&&other.swarm.phase==='seeking'&&other.target)assigned.set(other.target,(assigned.get(other.target)??0)+1);
   const next=(host.targets?.()??[]).map(id=>host.get(id)).filter(eligible).filter(t=>(assigned.get(t.id)??0)<d.maxPerTarget).sort((a,b)=>(assigned.get(a.id)??0)-(assigned.get(b.id)??0)||distance(a,shot.position)-distance(b,shot.position)||a.id-b.id)[0];
   if(next)shot.target=next.id;
   else s.phase='returning';
  }
 }
 const target=s.phase==='returning'?caster:host.get(shot.target)!;
 shot.point={x:target.x,y:target.y,height:target.height??host.height?.(target)??0};
 const before=shot.position,dx=shot.point.x-before.x,dy=shot.point.y-before.y,dh=shot.point.height-before.height,length=Math.hypot(dx,dy,dh),step=d.speed/40,t=Math.min(1,step/(length||1));
 shot.position={x:Math.round((before.x+dx*t)*1024)/1024,y:Math.round((before.y+dy*t)*1024)/1024,height:Math.round((before.height+dh*t)*1024)/1024};
 if(length>step)return false;
 if(s.phase==='returning'){
  if(s.hits||s.health||s.mana)returned({health:s.health,mana:s.mana});
  s.health=0;s.mana=0;s.hits=0;shot.target=0;
  if(now>=s.expires)return true;
  s.phase='seeking';shot.nextTick=Math.max(shot.nextTick,now+d.attackIntervalTicks);return false;
 }
 if(now<shot.nextTick)return false;
 const cargo={health:0,mana:0};impact(target,cargo);
 for(const key of ['health','mana'] as const)s[key]=Math.min(1000000,s[key]+Math.floor(cargo[key]*d.returnPermille/1000));
 s.hits++;shot.nextTick=now+d.attackIntervalTicks;
 if(s.hits>=d.maxHitsPerTrip||s.health+s.mana>=value(d.returnThreshold,spell.ranks[shot.rank-1])){s.phase='returning';shot.target=0;}
 return false;
}
