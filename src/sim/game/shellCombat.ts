import type {GameContext} from './context';
import type {Observation} from './observation';
import type {Entity} from './state';
import type {Owner} from '../../content/schema';
import type {DamageHit} from './combat';
import {precise} from './motion';
import {itemFlag} from './itemModifiers';

/** Persistent, non-homing shells. Damage and faction eligibility are captured on launch. */
export class ShellCombat {
 constructor(private c:GameContext,private vision:Observation,private teams:ReadonlyMap<Owner,number>,private hostile:(a:Entity,b:Entity)=>boolean){}
 expire(){
  for(const e of this.c.state.entities)if(e.slows){
   e.slows=e.slows.filter(s=>s.expires>this.c.state.tick);
   if(!e.slows.length)delete e.slows;
  }
  this.c.state.shells=this.c.state.shells.filter(s=>!s.resolved || this.c.state.tick<s.impact+20);
 }
 launch(a:Entity,b:Entity){
  const combat=this.c.def(a).behaviors.combat!,policy=combat.shell!;
  let radius=policy.radius,slowPermille=policy.slowPermille;
  for(const id of this.c.state.research[a.owner]??[])for(const effect of this.c.registry.rules.research[id]?.effects??[]){
   if(!effect.units.includes(a.definition))continue;
   radius=Math.max(radius,effect.splashRadius??0);slowPermille=Math.max(slowPermille,effect.splashSlowPermille??0);
  }
  const victims=[...this.teams.keys()].filter(owner=>a.owner==='none'||this.teams.get(owner)!==this.teams.get(a.owner));
  // Neutral camps may be hit when explicitly targeted; ordinary scenery is not a faction victim.
  if(b.owner==='none' || this.c.live().some(e=>e.owner==='none'&&this.hostile(a,e)))victims.push('none');
  if(a.unit?.order?.type==='attack'&&a.unit.order.force&&!victims.includes(b.owner))victims.push(b.owner);
  const origin=precise(a),target=precise(b);
  this.c.state.shells.push({id:this.c.state.nextShell++,source:a.id,definition:a.definition,owner:a.owner,
   origin:{x:origin.x,y:origin.y},target:{x:target.x,y:target.y},launched:this.c.state.tick,impact:this.c.state.tick+policy.flightTicks,
   damage:this.c.stats(a).damage,damageType:combat.damageType,radius,slowPermille,slowTicks:policy.slowTicks,victims,
   viewers:[...this.teams.keys()].filter(owner=>this.vision.visible(owner,a)&&this.vision.visible(owner,b)),resolved:false});
 }
 resolve():DamageHit[]{
  const hits:DamageHit[]=[];
  for(const shell of this.c.state.shells){
   if(shell.resolved||shell.impact>this.c.state.tick)continue;
   shell.resolved=true;
   for(const e of this.c.live()){
    if(e.hp===null||e.unit?.contained||e.unit?.release||!shell.victims.includes(e.owner))continue;
    // Structures use their footprint distance, units their authoritative subcell position.
    if(this.c.spatial.pointRange(shell.target,e)>shell.radius**2)continue;
    hits.push({source:shell.source,owner:shell.owner,target:e.id,damage:shell.damage,damageType:shell.damageType});
    if(e.unit && shell.slowPermille && !itemFlag(e,this.c.registry,'controlImmune') && !itemFlag(e,this.c.registry,'invulnerable')){
     e.slows??=[];const existing=e.slows.find(s=>s.permille===shell.slowPermille),expires=this.c.state.tick+shell.slowTicks;
     if(existing)existing.expires=Math.max(existing.expires,expires);else e.slows.push({permille:shell.slowPermille,expires});
    }
   }
  }
  return hits;
 }
}
