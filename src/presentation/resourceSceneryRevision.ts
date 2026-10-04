import type {EntityView} from '../sim/game/observation';

/** Derived hints for immutable decoded snapshots only. No wire/save state or
 * previous-frame chain: entries disappear with their owning entity array. */
const revisions=new WeakMap<readonly EntityView[],object>();
export function associateResourceScenery(entities:readonly EntityView[],revision:object):void {
 revisions.set(entities,revision);
}
export function resourceSceneryRevision(entities:readonly EntityView[]):object|undefined {
 return revisions.get(entities);
}
/** Exactly the source fields read by resourceStamps; amounts above zero and
 * gathering progress do not alter the rendered forest. */
export function resourceSceneryChanged(a:EntityView|undefined,b:EntityView):boolean {
 if(!a?.resource&&!b.resource)return false;
 return !a||!!a.resource!==!!b.resource||a.definition!==b.definition||
  a.x!==b.x||a.y!==b.y||a.rotation!==b.rotation||
  a.appearance?.asset!==b.appearance?.asset||a.appearance?.scale!==b.appearance?.scale||
  (a.resource!.amount>0)!==(b.resource!.amount>0)||
  (a.resource!.felling?.lastHitTick==null)!==(b.resource!.felling?.lastHitTick==null);
}
