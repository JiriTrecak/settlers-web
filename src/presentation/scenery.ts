import { content } from "../content/builtin";
import type { EntityView, SettlementView } from "../sim/game/observation";
import type { MapStamp, UtcMap } from "../shared/map/utcmap";
import { expandMap } from "../content/map";
export function authoredScene(
  entities: EntityView[],
  _size = 256,
): SettlementView {
  return {
    revision: 0,
    entities,
    outcome: null,
    events: [],
    objectives: {},
  };
}
/** Resource definition/state explicitly chooses scenery; filenames never create gameplay resources. */
export function resourceStamps(entities: readonly EntityView[]): MapStamp[] {
  return entities
    .filter(
      (e) =>
        e.resource &&
        e.resource.amount > 0 &&
        e.resource.felling?.lastHitTick == null &&
        content.get(e.definition).kind === "resource",
    )
    .map((e) => ({
      id: `resource-${e.id}`,
      asset: content.asset(
        e.appearance?.asset ?? content.get(e.definition).asset,
      ).sceneryAsset!,
      x: e.x - 0.5,
      y: e.y - 0.5,
      yaw: (e.rotation * Math.PI) / 180,
      scale: e.appearance?.scale ?? 1,
    }));
}
export function editorEntities(map: UtcMap): EntityView[] {
  return expandMap(map, content).map((p, i) => {
    const d = content.get(p.definition);
    return {
      id: i + 1,
      definition: p.definition,
      owner: p.owner,
      x: p.position.x,
      y: p.position.y,
      rotation: p.rotation,
      hp: d.body ? (p.initialState?.health ?? d.body.maxHp) : null,
      appearance: p.appearance,
      inventory: p.initialState?.inventory,
      ...(d.kind === "unit"
        ? {
            unit: {
              moving: false,
              contained: false,
              cargo: null,
              target: null,
              cooldown: 0,
            },
          }
        : {}),
      ...(d.gatheringCapacity
        ? { gathering: { workers: 0, capacity: d.gatheringCapacity } }
        : {}),
      ...(d.yield
        ? {
            resource: {
              amount: p.initialState?.amount ?? d.yield!,
              growingUntil: null,
              ...(d.felling ? {felling: {hp: d.felling.maxHp, lastHitTick: null, fallTick: null, direction: {x: 0, y: 1}}} : {}),
            },
          }
        : {}),
      ...(d.kind === "item"
        ? { item: { quantity: p.initialState?.quantity ?? 1 } }
        : {}),
    };
  });
}

/** Retain stamp identities through unrelated simulation ticks. Most of the map
 * is unchanged forest: never serialize the entire forest to detect a harvest. */
export class ResourceScenery {
  private readonly cache = new WeakMap<EntityView, MapStamp | null>();
  private previous: readonly MapStamp[] = [];
  project(entities: readonly EntityView[]): readonly MapStamp[] {
    const next: MapStamp[] = [];
    for (const e of entities) {
      if (!e.resource) continue;
      let stamp = this.cache.get(e);
      if (stamp === undefined) {
        stamp = resourceStamps([e])[0] ?? null;
        this.cache.set(e, stamp);
      }
      if (stamp) next.push(stamp);
    }
    if (next.length === this.previous.length && next.every((s,i) => {
      const p=this.previous[i]!;
      return s===p || (s.id===p.id && s.asset===p.asset && s.x===p.x && s.y===p.y && s.yaw===p.yaw && s.scale===p.scale);
    })) return this.previous;
    this.previous = next;
    return next;
  }
}
