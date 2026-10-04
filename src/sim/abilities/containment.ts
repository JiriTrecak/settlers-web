import {allEffects,value,type AbilityDefinition,type Effect} from '../../content/abilities/schema';
import type {Game} from '../game/game';
import {alive,type Entity} from '../game/state';
import {UNTIL_DEATH,type Containment} from './state';
type Contain=Extract<Effect,{op:'contain'}>;
/** Held actors stay authoritative but use the existing non-spatial contained state. */
export class SpellContainments {
 constructor(private readonly game:Game){}
 private get c(){return this.game.context;}
 occupants(host:number){return this.c.state.entities.filter(e=>e.spellContainment?.host===host).sort((a,b)=>a.id-b.id);}
 reason(host:Entity|undefined,victim:Entity|undefined,capacity:number):string|null{
  if(!host?.unit||!alive(host)||host.unit.contained||host.unit.garrison||host.unit.release)return 'Carrier is unavailable';
  if(!victim?.unit||!alive(victim)||host.id===victim.id||this.c.def(victim).hero||victim.summoned?.splitOperation||victim.unit.contained||victim.unit.garrison||victim.unit.release)return 'Choose an available non-hero unit';
  if(this.occupants(victim.id).length)return 'Cannot contain another occupied carrier';
  const held=this.occupants(host.id);
  for(const e of held){const s=e.spellContainment!,a=this.c.registry.abilityLibrary.abilities.find(a=>a.id===s.ability),op=a&&allEffects(a).find(o=>o.op==='contain'&&o.id===s.operation);if(op?.op==='contain')capacity=Math.min(capacity,op.capacity);}
  if(held.length>=capacity)return 'Carrier is full';
  return null;
 }
 hold(host:Entity,victim:Entity,ability:AbilityDefinition,rank:number,cast:number,op:Contain):number{
  if(this.reason(host,victim,op.capacity))return 0;
  this.game.abilities.cancel(victim.id,'Contained');this.game.economy.detachUnit(victim);
  const u=victim.unit!,now=this.c.state.tick,duration=op.lifetime==='untilDeath'?UNTIL_DEATH-now:value(op.amount,ability.ranks[rank-1]);
  victim.unit={...this.c.freshUnit(),cargo:u.cargo,cooldown:u.cooldown,camp:u.camp,contained:host.id,...(u.charge?{charge:{...u.charge,target:null}}:{})};
  victim.spellContainment={host:host.id,owner:host.owner,ability:ability.id,operation:op.id,rank,cast,started:now,expires:now+duration,nextTick:now+(op.digestion?.intervalTicks??duration)};
  victim.spellStatuses=victim.spellStatuses?.filter(s=>!s.aura);if(!victim.spellStatuses?.length)delete victim.spellStatuses;
  this.follow(victim,host);this.c.clampPools(victim);this.c.spatial.updateUnitMovement(victim);this.c.motionRevision++;this.c.observationRevision++;
  return duration;
 }
 private follow(victim:Entity,host:Entity){victim.x=host.x;victim.y=host.y;if(host.surface)victim.surface=host.surface;else delete victim.surface;}
 private release(victim:Entity,record:Containment){
  const host=this.c.get(record.host);if(host)this.follow(victim,host);
  delete victim.spellContainment;
  this.c.release(victim,host??victim);this.c.spatial.updateUnitMovement(victim);
  this.game.abilities.containmentEvent(record.host,victim.id,record,'releasedContained');
 }
 releaseHosted(host:number){let count=0;for(const e of this.occupants(host)){this.release(e,e.spellContainment!);count++;}return count;}
 tick(){
  for(const victim of [...this.c.state.entities].sort((a,b)=>a.id-b.id)){
   const record=victim.spellContainment;if(!record)continue;
   const host=this.c.get(record.host),a=this.c.registry.abilityLibrary.abilities.find(a=>a.id===record.ability),op=a&&allEffects(a).find((o):o is Contain=>o.op==='contain'&&o.id===record.operation);
   if(!host||!alive(host)||host.owner!==record.owner||host.unit?.contained||host.unit?.release||!op||!a||record.expires<=this.c.state.tick){this.release(victim,record);continue;}
   this.follow(victim,host);
   if(op.digestion&&record.nextTick<=this.c.state.tick){
    record.nextTick+=op.digestion.intervalTicks;
    const result=this.game.combat.abilityHit({source:host.id,owner:host.owner,target:victim.id,damage:value(op.digestion.damage,a.ranks[record.rank-1]),damageType:op.digestion.damageType});
    this.game.abilities.containmentEvent(host.id,victim.id,record,'digested',result.damage);
    for(const dead of result.dead)this.game.onCombatDeath(dead);
   }
  }
 }
}
