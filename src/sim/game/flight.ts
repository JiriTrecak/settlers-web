import {statusDefinition} from '../../content/abilities/schema';
import type {GameContext} from './context';
import type {Entity} from './state';
import {alive} from './state';
import {activeSpellFormEntry,desiredMovement} from '../abilities/forms';
import {fixed,precise} from './motion';
/** Bounded safe landing. A blocked return retains actual air classification until clearance exists. */
export function reconcileFlight(c:GameContext,e:Entity){
 const u=e.unit;if(!u||!alive(e)||u.contained||u.release||u.garrison)return;
 const base=c.registry.get(e.definition),movement=desiredMovement(base,e,c.registry);
 if(!movement)return;
 if(movement.locomotion==='air'){
  const entered=!u.flight,entry=activeSpellFormEntry(e,c.registry);
  u.flight={height:movement.flightHeight??6,...(entry?.form.movement?.locomotion==='air'?{source:{ability:entry.s.ability,status:entry.s.status,cast:entry.s.cast,rank:entry.s.rank,started:entry.s.started}}:{})};
  if(entered){delete e.surface;if(u.position)delete u.position.surface;clearRoute();}
  return;
 }
 if(!u.flight)return;
 const body={...c.spatial.dimensions(e),locomotion:'ground' as const},p=precise(e);
 const exact=c.spatial.free(p,e.id,body)?p:undefined;
 const landing=exact??c.spatial.nearest({x:Math.round(p.x),y:Math.round(p.y)},3,e.id,body);
 if(!landing)return;
 e.x=Math.round(landing.x);e.y=Math.round(landing.y);u.position=fixed(landing);delete e.surface;if(landing.surface)e.surface=landing.surface;
 delete u.flight;clearRoute();c.spatial.updateUnitMovement(e);
 function clearRoute(){const destination=u!.order?.type==='move'?u!.order.destination:u!.goal!==null?c.spatial.point(u!.goal):undefined;u!.route=[];u!.segment=null;u!.goal=null;delete u!.detour;u!.retryAt=c.state.tick;delete u!.attack;delete u!.charge;c.motionRevision++;c.observationRevision++;if(destination){const point=c.spatial.airborne(e)?{x:destination.x,y:destination.y}:destination;c.spatial.route(e,point,false);}}
}

/** Reject fabricated flight or height changes before replacing the live state. */
export function validateFlight(e:Entity,registry:import('../../content/registry').ContentRegistry,tick:number,nextCast:number){
 const f=e.unit?.flight,base=registry.get(e.definition);if(!f){if(e.unit&&alive(e)&&!e.unit.contained&&!e.unit.release&&!e.unit.garrison&&desiredMovement(base,e,registry)?.locomotion==='air')throw Error('Missing saved flight');return;}
 const s=f.source;
 if(!base.behaviors.movement||e.surface||e.unit?.position?.surface)throw Error('Invalid saved flight');
 if(s){
  const ability=registry.abilityLibrary.abilities.find(a=>a.id===s.ability),form=ability&&statusDefinition(ability,s.status)?.form;
  if(!ability?.ranks[s.rank-1]||form?.movement?.locomotion!=='air'||s.cast>=nextCast||s.started>tick||f.height!==(form.movement.flightHeight??base.behaviors.movement.flightHeight??6))throw Error('Invalid saved flight source');
 }else if(base.behaviors.movement.locomotion!=='air'||f.height!==(base.behaviors.movement.flightHeight??6))throw Error('Invalid saved native flight');
 if(alive(e)&&!e.unit?.contained&&!e.unit?.release&&!e.unit?.garrison&&desiredMovement(base,e,registry)?.locomotion==='air'){
  const active=activeSpellFormEntry(e,registry),expected=active?.form.movement?.locomotion==='air'?active.s:undefined;
  if(expected?(!s||s.ability!==expected.ability||s.status!==expected.status||s.cast!==expected.cast||s.rank!==expected.rank||s.started!==expected.started):!!s)throw Error('Saved flight does not match active movement');
 }
}
