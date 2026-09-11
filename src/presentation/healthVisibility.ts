import type {EntityView} from '../sim/game/observation';

/** Health inspection uses only the observation, including its allegiance and fog state. */
export function healthBarVisible(entity:EntityView,kind:string,maxHp:number,selected:boolean,held:ReadonlySet<string>):boolean{
 if(entity.hp==null||entity.hp<=0||entity.remembered||entity.unit?.contained)return false;
 return selected||(kind==='unit'&&entity.hp<maxHp)||held.has('health.all')||
  (held.has('health.enemy')&&entity.hostile===true)||
  (held.has('health.friendly')&&entity.hostile===false&&entity.owner!=='none');
}
