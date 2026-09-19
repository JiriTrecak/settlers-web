import type {GameContext} from './context';
import {alive,type Entity} from './state';
import {atPoint,precise} from './motion';
import {isStunned} from './effects';

/** Height belongs to the firing/sight origin, never to a pathfinding floor. */
export const elevatedPoint=(e:Entity)=>({...precise(e),...(e.unit?.garrison?{elevation:e.unit.garrison.height}:{})});

export function leaveGarrison(c:GameContext,e:Entity){
 const host=c.get(e.unit?.garrison?.building);
 if(!e.unit?.garrison)return;
 c.release(e,host?c.spatial.entrance(host):e);
}

/** Single-slot lookouts. Reservations and occupancy are authoritative unit state
 * so save/load, queued orders and lockstep clients make the same decision. */
export class Garrisons {
 constructor(private readonly c:GameContext){}
 occupant(host:Entity){return this.c.liveUnits().find(e=>e.unit?.garrison?.building===host.id);}
 eligible(e:Entity,host:Entity){
  return !!e.unit&&!e.unit.contained&&!e.unit.release&&!e.unit.cargo&&this.c.ready(host)&&!host.construction&&
   host.owner===e.owner&&!!this.c.def(host).garrison?.accepts.includes(e.definition);
 }
 available(e:Entity,host:Entity){
  return this.eligible(e,host)&&!this.c.liveUnits().some(other=>other.id!==e.id&&
   (other.unit?.garrison?.building===host.id||(other.unit?.order?.type==='garrison'&&other.unit.order.target===host.id)));
 }
 unload(host:Entity){const e=this.occupant(host);if(!e)return false;leaveGarrison(this.c,e);return true;}
 tick(){
  const c=this.c;
  for(const e of c.liveUnits()){
   const u=e.unit!;
   if(u.garrison){
    const host=c.get(u.garrison.building);
    if(!host||!alive(host)||!this.eligible(e,host))leaveGarrison(c,e);
    else {u.route=[];u.goal=null;}
    continue;
   }
   if(u.order?.type!=='garrison'||!c.ready(e)||isStunned(e,c.registry))continue;
   const host=c.get(u.order.target);
   if(!host||!alive(host)||!this.available(e,host)){u.order=null;u.route=[];u.goal=null;continue;}
   const entrance=c.spatial.entrance(host);
   if(atPoint(e,entrance)){
    u.garrison={building:host.id,height:c.def(host).garrison!.height};
    u.order={type:'hold'};u.route=[];u.goal=null;u.segment=null;u.position=null;
    u.target=null;u.idle=null;delete u.detour;delete u.attack;delete u.pursuit;
    e.x=host.x;e.y=host.y;if(host.surface)e.surface=host.surface;else delete e.surface;
    c.motionRevision++;c.observationRevision++;
   }else if(!u.route.length&&u.retryAt<=c.state.tick){
    c.spatial.route(e,entrance);u.retryAt=c.state.tick+12;
   }
  }
 }
}
