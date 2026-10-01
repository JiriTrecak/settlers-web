import {spellControl} from '../abilities/statuses';
import { itemFlag } from "./itemModifiers";
import type {ContentRegistry} from '../../content/registry';
import type {Entity} from './state';
export function isStunned(e:Entity,registry:ContentRegistry){
 if(itemFlag(e,registry,"controlImmune")) return false;
 return (e.stunnedUntil??0)>0||spellControl(e,registry,"stun");
}
