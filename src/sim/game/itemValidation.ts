import type { ContentRegistry } from "../../content/registry";
import type { Entity } from "./state";
/** Save/runtime data can carry state, but cannot invent effects outside declarations. */
export function validateItemState(e: Entity, registry: ContentRegistry): void {
  const runtime = (id: string | null | undefined, state: NonNullable<Entity["equipmentState"]>[number]) => {
    if (!state) return;
    const effect=id ? registry.find(id)?.itemEffect : undefined;
    if(!effect) throw new Error("Item runtime requires an item");
    const maxCharges=effect.active?.charges ?? effect.rescue?.charges;
    if((state.charges!==undefined && (maxCharges===undefined || state.charges<1 || state.charges>maxCharges)) || (maxCharges!==undefined && state.charges===undefined) || state.hits >= (effect.onHit?.every ?? 1)) throw new Error("Invalid saved item charges or trigger counter");
  };
  if(e.equipmentState){
    if(e.equipmentState.length!==e.equipment?.length)throw new Error("Invalid saved item slots");
    e.equipmentState.forEach((s,i)=>runtime(e.equipment?.[i],s));
  }
  if(e.item?.runtime)runtime(e.definition,e.item.runtime);
  const seen=new Set<string>();
  for(const s of e.itemStatuses ?? []){
    const effect=registry.find(s.item)?.itemEffect;
    const policy=s.kind==='aura'?effect?.aura:s.kind==='active'?effect?.active?.status:effect?.rescue;
    const key=`${s.item}:${s.kind}`;
    if(!e.unit || !policy || seen.has(key) || (s.shield!==undefined && (s.kind!=='active' || s.shield>(effect?.active?.status?.shield ?? 0))))throw new Error("Invalid saved item status");
    seen.add(key);
  }
  for(const hit of e.itemHits ?? []) {
    const active=registry.find(hit.item)?.itemEffect?.active;
    if(hit.source!==e.id || !active?.damage || hit.damage!==active.damage || hit.damageType!==active.damageType)throw new Error("Invalid queued item damage");
  }
}
