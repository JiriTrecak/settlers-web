import {locomotion} from '../game/locomotion';
import type {GameContext} from '../game/context';
import type {Entity} from '../game/state';
import {precise} from '../game/motion';
import {unitNature} from './eligibility';
import type {AbilityActor} from './runtime';
import type {SpellSource} from './state';
import type {ContentRegistry} from '../../content/registry';
/** Snapshot primitive values only; never keep removed entity objects alive. */
export function spellSource(c:GameContext,e:Entity):SpellSource{
 const stats=c.stats(e),p=precise(e);
 return {height:c.spatial.height(p)+c.spatial.elevation({...e,...p}),locomotion:locomotion(c.def(e)),source:e.id,definition:e.definition,owner:e.owner,position:{x:p.x,y:p.y},camp:e.unit?.camp??undefined,level:stats.level,summoned:!!e.summoned,resources:{hp:Math.min(e.hp??0,stats.maxHp),maxHp:stats.maxHp,mana:Math.min(e.abilities?.mana??0,stats.maxMana),maxMana:stats.maxMana}};
}
export function sourceActor(s:SpellSource,registry:ContentRegistry):AbilityActor{
 const d=registry.get(s.definition);
 return {height:s.height,id:s.source,owner:s.owner,camp:s.camp,...s.position,hp:0,maxHp:d.body?.maxHp??0,...s.resources,alive:false,unit:d.kind==='unit',hero:!!d.hero,locomotion:s.locomotion??locomotion(d),nature:unitNature(d),summoned:s.summoned,level:s.level,blocked:true,targetable:false,sourceContext:{height:s.height,locomotion:s.locomotion,source:s.source,definition:s.definition,owner:s.owner,position:{...s.position},camp:s.camp,level:s.level,summoned:s.summoned,...(s.resources?{resources:{...s.resources}}:{})}};
}
