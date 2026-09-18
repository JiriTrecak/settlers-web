import {canonical} from '../../content/registry';
import type {Action} from '../../shared/types/types';
import type {EntityView} from '../game/observation';
import type {AIState} from './state';
import {distance,integerPoint} from './frame';

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
