import {value,type Control} from '../../content/abilities/schema';
import {discardNavigation,releaseCombat} from '../game/combatIntent';
import {precise} from '../game/motion';
import type {Game} from '../game/game';
import type {Entity,UnitOrder} from '../game/state';

type CastOrder=Extract<UnitOrder,{type:'castAbility'}>;
/** A spell intention uses ordinary navigation until its existing cast validator accepts it. */
export class SpellCastOrders {
 constructor(private readonly game:Game){}
 issue(e:Entity,binding:string,target:CastOrder['target'],control:Control):string|null{
  const aim=target.kind==='unit'?target.entity:target.position;
  const reason=this.game.abilities.reason(e.id,binding,aim,control);
  if(reason!=='Target is out of range'){
   if(reason)return reason;
   const previous=e.unit?.order,error=this.game.abilities.cast(e.id,binding,aim,control);
   if(!error&&previous?.type==='castAbility'&&e.unit?.order===previous){e.unit.order=null;discardNavigation(e.unit);}
   return error;
  }
  const invalid=this.game.abilities.reason(e.id,binding,aim,control,true);
  if(invalid)return invalid;
  if(!e.unit||!this.game.context.def(e).behaviors.movement||e.unit.cargo)return reason;
  return this.game.orders.issue(e,{type:'castAbility',binding,target:structuredClone(target),owner:e.owner,control})?null:'Caster cannot move to cast';
 }
 tick(plan=true){
  const g=this.game,c=g.context;
  for(const e of c.activeUnits()){
   const u=e.unit!,order=u.order;if(order?.type!=='castAbility')continue;
   const aim=order.target.kind==='unit'?order.target.entity:order.target.position;
   const reason=e.owner!==order.owner?'Caster changed owner':g.abilities.reason(e.id,order.binding,aim,order.control);
   if(!reason){g.abilities.cast(e.id,order.binding,aim,order.control);continue;}
   if(reason!=='Target is out of range'){
    u.order=null;discardNavigation(u);releaseCombat(u);continue;
   }
   if(!plan||u.retryAt>c.state.tick)continue;
   const target=typeof aim==='number'?precise(c.get(aim)!):aim;
   const binding=c.def(e).behaviors.abilities!.bindings.find(b=>b.id===order.binding)!;
   const spell=c.registry.findAbility(binding.ability)!;
   const range=value(spell.targeting.range,spell.ranks[e.abilities!.ranks[binding.id]-1]);
   // Keep a valid route while tracking moving targets; retry blocked traffic at a bounded rate.
   if(u.route.length&&u.goal!==null){const goal=c.spatial.point(u.goal);if((goal.x-target.x)**2+(goal.y-target.y)**2<=range**2)continue;}
   discardNavigation(u);releaseCombat(u);u.retryAt=c.state.tick+12;
   const from=precise(e),candidates:{x:number;y:number;surface?:string;distance:number}[]=[];
   // Sample the cast boundary plus inner rings. The shared pathfinder handles obstacles,
   // body clearance, water and elevation; the cast validator remains the range authority.
   const seen=new Set<string>();
   for(const fraction of [1,.75,.5,.25,0])for(let i=0;i<32;i++){
    const angle=Math.atan2(from.y-target.y,from.x-target.x)+i*Math.PI/16;
    const x=Math.round(target.x+Math.cos(angle)*Math.max(0,range-.5)*fraction),y=Math.round(target.y+Math.sin(angle)*Math.max(0,range-.5)*fraction);
    const key=`${x}:${y}`;if(seen.has(key)||(x-target.x)**2+(y-target.y)**2>range**2)continue;seen.add(key);
    const point={x,y,...(from.surface?{surface:from.surface}:{})};
    if(c.spatial.validPoint(point))candidates.push({...point,distance:(x-from.x)**2+(y-from.y)**2});
   }
   candidates.sort((a,b)=>a.distance-b.distance||a.y-b.y||a.x-b.x);
   for(const point of candidates)if(c.spatial.route(e,point,false))break;
  }
 }
}
