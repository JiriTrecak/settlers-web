import {canonical} from '../../content/registry';
import type {Action} from '../../shared/types/types';
import type {EntityView} from '../game/observation';
import type {AIState} from './state';
import type {Point} from '../game/state';
import {distance,integerPoint} from './frame';

export const REINFORCEMENT_JOIN_RADIUS=16;

/** A moving reinforcement already approaching the army's join area need not
 * restart its long route for each small movement of the leader. Actual movement
 * is required: stalled units, new intentions and changed floors still retarget.
 * Uses observed, saved unit orders only; no hidden navigation cache or timer.
 */
export function approachingArmy(entity:EntityView,leader:Point):boolean {
 const order=entity.control?.order;
 return !!entity.unit?.moving&&order?.type==='move'&&order.attackMove&&
  order.destination.surface===leader.surface&&distance(order.destination,leader)<REINFORCEMENT_JOIN_RADIUS;
}

/** A reinforcement changes the recipients, not the order existing units follow. */
export function orderIntent(action:Action):string {
  if('actors' in action){const {actors:_,...intent}=action;return canonical(intent);}
  return canonical(action);
}
export function continuesOrder(entity:EntityView|undefined,old:AIState['orders'][string]|undefined,
 action:Action,intent:string,tick:number,interval:number):boolean {
 if(!entity||!old||old.signature!==intent)return false;
 if(action.type==='move'&&distance(entity,action.destination)<2&&entity.surface===action.destination.surface)return true;
 const order=entity.control?.order;
 if(action.type==='gather'&&order?.type==='gather'&&order.target===action.target)return true;
 if(action.type==='attack'&&order?.type==='attack'&&order.target===action.target)return true;
 if(action.type==='pickup'&&order?.type==='pickup'&&order.target===action.target&&tick-old.tick<400)return true;
 if(entity.unit?.moving&&distance(old.point,entity)>1){old.point=integerPoint(entity);old.tick=tick;return true;}
 return tick-old.tick<Math.max(interval,160);
}
