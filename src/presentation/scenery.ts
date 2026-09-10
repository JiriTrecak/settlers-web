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
            },
          }
        : {}),
      ...(d.kind === "item"
        ? { item: { quantity: p.initialState?.quantity ?? 1 } }
        : {}),
    };
  });
}
