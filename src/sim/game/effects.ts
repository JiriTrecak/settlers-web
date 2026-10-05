import {controlImmune} from '../abilities/controlPolicy';
import {spellControl} from '../abilities/statuses';
import type {ContentRegistry} from '../../content/registry';
import type {Entity} from './state';
export function isStunned(e:Entity,registry:ContentRegistry){
 if(!(e.stunnedUntil??0)&&!e.spellStatuses?.length)return false;
 if(controlImmune(e,registry,'stun')) return false;
 return (e.stunnedUntil??0)>0||spellControl(e,registry,"stun");
}
