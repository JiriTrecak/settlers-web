import type {Game} from '../game/game';
import {alive,type Entity} from '../game/state';
import type {LuaHost,Scalar} from '../../shared/scenario/lua';

/** Callback-local inventory drafts make exchange queries observe earlier writes.
 * The host commits these only after the entire Lua callback validates. */
export function missionInventory(g:Game, entity:(id:Scalar)=>Entity|undefined, operations:(()=>void)[]):LuaHost {
  const drafts=new Map<number,(string|null)[]>();
  function inventory(id:Scalar) {
    const e=entity(id);
    if(!e||!alive(e)||!e.equipment)return null;
    let slots=drafts.get(e.id);
    if(!slots){slots=[...e.equipment];drafts.set(e.id,slots);}
    return {e,slots};
  }
  function item(raw:Scalar) {
    const d=typeof raw==='string'?g.registry.find(raw):undefined;
    if(!d?.itemEffect||d.kind!=='item')throw new Error('Expected a hero inventory item');
    return d.id;
  }
  return {
    has_item:(id,raw)=>{const definition=item(raw);return inventory(id)?.slots.includes(definition)??false;},
    give_item:(id,raw)=>{
      const definition=item(raw),target=inventory(id),slot=target?.slots.indexOf(null)??-1;
      if(!target||slot<0)return false;
      target.slots[slot]=definition;
      operations.push(()=>{
        target.e.equipment![slot]=definition;
        if(target.e.equipmentState)target.e.equipmentState[slot]=null;
      });
      return true;
    },
    take_item:(id,raw)=>{
      const definition=item(raw),target=inventory(id),slot=target?.slots.indexOf(definition)??-1;
      if(!target||slot<0)return false;
      target.slots[slot]=null;
      operations.push(()=>{
        target.e.equipment![slot]=null;
        if(target.e.equipmentState)target.e.equipmentState[slot]=null;
        const stats=g.context.stats(target.e);
        target.e.hp=Math.min(target.e.hp!,stats.maxHp);
        if(target.e.spellcasting)target.e.spellcasting.mana=Math.min(target.e.spellcasting.mana,stats.maxMana);
      });
      return true;
    },
  };
}
