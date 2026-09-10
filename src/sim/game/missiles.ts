import type {Owner} from '../../content/schema';
import type {GameContext} from './context';
import type {Observation} from './observation';
import type {DamageHit} from './combat';
import {alive, type Entity} from './state';
import {precise} from './motion';
import {TICK_MS} from '../../shared/match/match';
/** Homing unit weapons. Once released, the missile is independent of its shooter. */
export class Missiles {
 constructor(private c:GameContext,private vision:Observation,private owners:readonly Owner[]){}
 launch(a:Entity,b:Entity,damage:number){
  const weapon=this.c.def(a).behaviors.combat!,origin=precise(a),destination=precise(b);
  const distance=Math.hypot(destination.x-origin.x,destination.y-origin.y);
  const flight=Math.max(1,Math.ceil(distance/weapon.projectile!.speed*1000/TICK_MS));
  this.c.state.missiles.push({id:this.c.state.nextMissile++,source:a.id,target:b.id,definition:a.definition,owner:a.owner,
   origin:{x:origin.x,y:origin.y},destination:{x:destination.x,y:destination.y},launched:this.c.state.tick,impact:this.c.state.tick+flight,
   damage,damageType:weapon.damageType,resolved:false,
   viewers:this.owners.filter(owner=>this.vision.visible(owner,a)&&this.vision.visible(owner,b))});
 }
 resolve():DamageHit[]{
  this.c.state.missiles=this.c.state.missiles.filter(m=>!m.resolved || this.c.state.tick<m.impact+4);
  const hits:DamageHit[]=[];
  for(const m of this.c.state.missiles){
   if(m.resolved)continue;
   const target=this.c.get(m.target);
   if(target && alive(target)){const p=precise(target);m.destination={x:p.x,y:p.y};}
   if(this.c.state.tick<m.impact)continue;
   m.resolved=true;
   if(!target||!alive(target)||target.hp===null||target.unit?.contained||target.unit?.release)continue;
   hits.push({source:m.source,owner:m.owner,target:target.id,damage:m.damage,damageType:m.damageType,weapon:true});
  }
  return hits;
 }
}
