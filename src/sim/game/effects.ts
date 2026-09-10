import { itemFlag } from "./itemModifiers";
import type {ContentRegistry} from '../../content/registry';
import type {Entity} from './state';
export function isStunned(e:Entity,registry:ContentRegistry){
 if(itemFlag(e,registry,"controlImmune")) return false;
 return e.effects?.some(b=>(registry.rules.spells[b.ability]?.ranks[b.rank-1].stunTicks??0)>0)??false;
}
